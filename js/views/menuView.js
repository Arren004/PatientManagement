// ============================================
// MENU VIEW - Render menu
// ============================================

import { MENU_ITEMS } from "../data/constants.js";
import authService from "../services/authService.js";

export function renderMenuView(container, activeView) {
  container.innerHTML = "";
  const user = authService.getCurrentUser();
  if (user && user.role === 'config') {
    return;
  }
  MENU_ITEMS.forEach((item) => {
    // Chỉ hiển thị mục Cơ sở dữ liệu cho Y tá trưởng
    if (item.key === "dbexplorer" && !authService.isHeadNurse()) {
      return;
    }
    const button = document.createElement("button");
    button.className = "menu-item" + (item.key === activeView ? " active" : "");
    button.innerHTML = `<span>${item.label}</span>`;
    button.dataset.key = item.key;
    button.addEventListener("click", () => {
      // Event sẽ được handle bởi controller
      document.dispatchEvent(new CustomEvent("menuItemClick", { detail: { key: item.key } }));
    });
    container.appendChild(button);
  });
}

export function updateActiveMenuItem(container, activeView) {
  container.querySelectorAll(".menu-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.key === activeView);
  });
}
