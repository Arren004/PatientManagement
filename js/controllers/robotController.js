// ============================================
// ROBOT CONTROLLER - Xử lý events robot
// ============================================

import robotService from "../services/robotService.js";
import { renderRobotView } from "../views/robotView.js";

class RobotController {

  constructor() {
    this.viewContainer = document.getElementById("view-robots");
    this.selectedRobotId = null;
    //new
    this.unsubscribe = null;
  }

  init() {
    // Render sẽ được gọi khi switch view
  }

  async renderView() {
    // Nếu đã có listener thì bỏ listener cũ
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    // Lắng nghe realtime robots
    this.unsubscribe = await robotService.listenRobotsRealtime((robots) => {
      const stats = {
        total: robots.length,
        online: robots.filter(r => r.online).length,
        offline: robots.length - robots.filter(r => r.online).length
      };
      if (!this.selectedRobotId && robots.length) {
        this.selectedRobotId = robots[0].id;
      }
      renderRobotView(this.viewContainer, robots, stats, this.selectedRobotId);
      this.setupEventListeners();
    });
  }

  setupEventListeners() {
    // Sự kiện mở modal thêm robot
    const showAddBtn = this.viewContainer.querySelector("#show-add-robot-modal");
    if (showAddBtn) {
      showAddBtn.addEventListener("click", () => {
        this.showAddRobotModal();
      });
    }

    // Sự kiện điều chỉnh tốc độ robot
    const speedInput = this.viewContainer.querySelector("#robot-speed-input");
    if (speedInput) {
      speedInput.addEventListener("change", async (e) => {
        const speed = Number(e.target.value);
        const robotId = speedInput.dataset.robotId;
        await robotService.updateRobotSpeedInFirestore(robotId, speed);
        this.renderView();
      });
    }

    // Sự kiện chuyển robot chính khi click vào robot phụ
    this.viewContainer.querySelectorAll('.robot-list-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedRobotId = item.dataset.robotId;
        this.renderView();
      });
    });
  }

  showAddRobotModal() {
    // Nếu đã có modal thì không tạo lại
    if (document.getElementById("add-robot-modal")) return;
    const modal = document.createElement("div");
    modal.id = "add-robot-modal";
    modal.style = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.25);z-index:1000;display:flex;align-items:center;justify-content:center;`;
    modal.innerHTML = `
      <div style="background:#fff;padding:32px 24px;border-radius:16px;min-width:340px;box-shadow:0 8px 32px #0002;position:relative;max-width:95vw;">
        <button id="close-add-robot-modal" style="position:absolute;top:12px;right:12px;background:none;border:none;font-size:22px;cursor:pointer;">&times;</button>
        <h2 style="margin-bottom:18px;">Thêm robot mới</h2>
        <form id="add-robot-form-modal">
          <div style="margin-bottom:14px;">
            <label for="robot-name-input-modal">Tên robot</label>
            <input type="text" id="robot-name-input-modal" required placeholder="Nhập tên robot" style="width:100%;padding:8px;margin-top:4px;" />
          </div>
          <div style="margin-bottom:14px;">
            <label for="robot-avatar-input">Ảnh đại diện</label><br>
            <input type="file" id="robot-avatar-input" accept="image/*" style="margin-top:4px;" />
            <div id="robot-avatar-preview" style="margin-top:8px;"></div>
          </div>
          <div style="margin-bottom:14px;">
            <label for="robot-floor-input">Tầng phục vụ</label>
            <input type="text" id="robot-floor-input" placeholder="VD: 2nd" style="width:100%;padding:8px;margin-top:4px;" />
          </div>
          <div style="margin-bottom:14px;">
            <label for="robot-location-input">Vị trí</label>
            <input type="text" id="robot-location-input" placeholder="VD: Delivering Room 205" style="width:100%;padding:8px;margin-top:4px;" />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px;">Thêm robot</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    // Đóng modal
    modal.querySelector("#close-add-robot-modal").onclick = () => modal.remove();

    // Xem trước ảnh đại diện
    const avatarInput = modal.querySelector("#robot-avatar-input");
    const avatarPreview = modal.querySelector("#robot-avatar-preview");
    let avatarBase64 = "";
    avatarInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        avatarBase64 = ev.target.result;
        avatarPreview.innerHTML = `<img src="${avatarBase64}" alt="avatar" style="max-width:80px;max-height:80px;border-radius:12px;box-shadow:0 2px 8px #0001;" />`;
      };
      reader.readAsDataURL(file);
    };

    // Submit form
    modal.querySelector("#add-robot-form-modal").onsubmit = async (e) => {
      e.preventDefault();
      const name = modal.querySelector("#robot-name-input-modal").value.trim();
      const floor = modal.querySelector("#robot-floor-input").value.trim() || "1st";
      const location = modal.querySelector("#robot-location-input").value.trim() || "";
      if (!name) return;
      const id = name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();
      await robotService.addRobotToFirestore({
        id,
        name,
        battery: 100,
        floor,
        location,
        online: true,
        task: "Idle",
        avatar: avatarBase64,
        speed: 50
      });
      modal.remove();
      this.renderView();
    };
  }
}


export default new RobotController();
