// ============================================
// PROFILE CONTROLLER - Xử lý hồ sơ cá nhân
// ============================================

import authService from "../services/authService.js";
import { renderProfileView } from "../views/profileView.js";
import { showToast, setupModalClose, focusFirstInputInModal } from "../utils/ui.js";

class ProfileController {
  constructor() {
    this.viewContainer = document.getElementById("view-profile");
    this.draft = null;
  }

  init() {
    if (!this.viewContainer) return;

    this.viewContainer.addEventListener("profile:refresh", () => {
      this.renderView();
    });
  }

  getDraft() {
    const currentUser = authService.getCurrentUser();
    if (!this.draft) {
      this.draft = {
        fullName: currentUser?.fullName || "",
        phone: currentUser?.phone || "",
        avatar: currentUser?.avatar || "",
        notes: currentUser?.notes || "",
      };
    }
    return { ...this.draft };
  }

  setDraft(partial) {
    this.draft = {
      ...this.getDraft(),
      ...partial,
    };
  }

  async renderView() {
    if (!this.viewContainer) return;
    renderProfileView(this.viewContainer, authService.getCurrentUser());
    this.setupEventListeners();
  }

  setupEventListeners() {
    const form = this.viewContainer.querySelector("#profile-form");
    const avatarInput = this.viewContainer.querySelector("#profile-avatar");
    const resetBtn = this.viewContainer.querySelector("#profile-reset-btn");
    const passwordBtn = this.viewContainer.querySelector("#profile-open-password-btn");

    if (form) {
      const currentUser = authService.getCurrentUser();
      const nameInput = form.querySelector("#profile-fullname");
      const phoneInput = form.querySelector("#profile-phone");
      const notesInput = form.querySelector("#profile-notes");
      const avatarPreview = form.querySelector(".profile-avatar-large");

      const syncDraft = () => {
        this.setDraft({
          fullName: nameInput ? nameInput.value : currentUser?.fullName || "",
          phone: phoneInput ? phoneInput.value : currentUser?.phone || "",
          notes: notesInput ? notesInput.value : currentUser?.notes || "",
        });
      };

      [nameInput, phoneInput, notesInput].forEach((input) => {
        if (input) {
          input.addEventListener("input", syncDraft);
        }
      });

      if (avatarInput) {
        avatarInput.addEventListener("change", (event) => {
          const file = event.target.files && event.target.files[0];
          if (!file) {
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const avatar = String(reader.result || "");
            this.setDraft({ avatar });
            if (avatarPreview) {
              avatarPreview.innerHTML = `<img src="${avatar}" alt="Avatar" />`;
            }
          };
          reader.readAsDataURL(file);
        });
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        syncDraft();
        const draft = this.getDraft();

        const result = await authService.updateCurrentProfile({
          fullName: draft.fullName.trim(),
          phone: draft.phone.trim(),
          avatar: draft.avatar,
          notes: draft.notes.trim(),
        });

        if (!result.success) {
          showToast(result.message || "Không thể cập nhật hồ sơ.");
          return;
        }

        this.draft = null;
        showToast(result.message);
        document.dispatchEvent(new CustomEvent("userProfileUpdated"));
        await this.renderView();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.draft = null;
        this.renderView();
      });
    }

    if (passwordBtn) {
      passwordBtn.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("profile:open-change-password"));
      });
    }

    const profileModal = this.viewContainer.querySelector(".modal-overlay");
    if (profileModal) {
      setupModalClose(profileModal, () => {});
      focusFirstInputInModal(profileModal);
    }
  }
}

export default new ProfileController();
