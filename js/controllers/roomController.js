// ============================================
// ROOM CONTROLLER - Xử lý logic phòng bệnh
// ============================================


import roomService from "../services/roomService.js";
import authService from "../services/authService.js";
import stateService from "../services/stateService.js";
import { renderRoomListView, renderRoomDetailView } from "../views/roomView.js";


class RoomController {
  constructor() {
    this.viewContainer = document.getElementById("view-rooms");
    this.currentRoomId = null;
    // Đồng bộ currentUser từ localStorage nếu có (chống mất đồng bộ khi reload view)
    const userStr = localStorage.getItem("currentUser");
    if (userStr && !authService.currentUser) {
      try {
        authService.currentUser = JSON.parse(userStr);
      } catch (e) {}
    }
    if (typeof window !== "undefined") {
      window.roomController = this;
    }
  }

  init() {
    this.renderView();
    document.addEventListener("addRoomClick", () => this.handleAddRoom());
    document.addEventListener("backToRoomList", () => {
      this.currentRoomId = null;
      this.renderView();
    });

    stateService.subscribe(() => {
      // Chỉ re-render khi view phòng bệnh đang được hiển thị
      const viewRooms = document.getElementById("view-rooms");
      if (viewRooms && viewRooms.offsetParent !== null) {
        this.renderView();
      }
    });
  }

  async renderView() {
    // Luôn đồng bộ lại currentUser từ localStorage trước khi render (chống mất quyền khi back)
    const userStr = localStorage.getItem("currentUser");
    if (userStr) {
      try {
        authService.currentUser = JSON.parse(userStr);
      } catch (e) {}
    }
    const rooms = await roomService.getRooms();
    if (!this.currentRoomId) {
      renderRoomListView(this.viewContainer, rooms, (roomId) => {
        this.currentRoomId = roomId;
        this.renderView();
      });
    } else {
      const room = rooms.find(r => r.id === this.currentRoomId);
      if (!room) return;
      renderRoomDetailView(this.viewContainer, room, (roomId) => this.handleAddBed(roomId), (roomId) => this.handleRemoveBed(roomId));
    }
  }

  async handleAddRoom() {
    // Chỉ cho phép admin
    if (!authService.can("rooms.create")) {
      alert("Chỉ admin mới được thêm phòng.");
      return;
    }
    // ...existing code...
    if (document.getElementById("add-room-modal")) return;
    const modal = document.createElement("div");
    modal.id = "add-room-modal";
    modal.className = "modal-overlay show";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:440px;padding:36px 36px 28px 36px;border-radius:28px;box-shadow:0 8px 40px #2563eb22;">
        <h3 style="font-size:2rem;font-weight:800;margin-bottom:22px;">Thêm phòng mới</h3>
        <form id="add-room-form" autocomplete="off">
          <label for="room-name-input" style="font-weight:700;font-size:1.08rem;">Số phòng</label>
          <input id="room-name-input" type="text" placeholder="Nhập số phòng (vd: 101)" required style="margin-bottom:18px;width:100%;padding:12px 16px;border-radius:12px;border:1.5px solid #dde8f3;font-size:1.08rem;outline:none;transition:border 0.18s;" />
          <label for="bed-count-input" style="font-weight:700;font-size:1.08rem;">Số lượng giường</label>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;">
            <input id="bed-count-input" type="number" min="1" value="1" required style="flex:1;padding:12px 16px;border-radius:12px;border:1.5px solid #dde8f3;font-size:1.08rem;outline:none;transition:border 0.18s;" />
            <button id="confirm-bed-count" type="button" style="margin-left:8px;background:#fff;border:2px solid #10b981;border-radius:8px;width:38px;height:38px;outline:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px #10b98122;transition:background 0.15s,border 0.15s;">
              <img src="image/right.png" alt="Xác nhận" style="width:22px;height:22px;object-fit:contain;" />
            </button>
          </div>
          <div id="bed-positions-form" style="margin-bottom:10px;"></div>
          <div style="display:flex;gap:14px;justify-content:flex-end;margin-top:18px;">
            <button type="button" id="cancel-add-room" class="ghost-btn" style="background:#e0e7ef;color:#23476a;font-weight:700;border-radius:12px;padding:10px 28px;">Huỷ</button>
            <button type="submit" class="ghost-btn" style="background:linear-gradient(120deg,#10b981,#2563eb);color:#fff;font-weight:800;border-radius:12px;padding:10px 28px;box-shadow:0 2px 8px #2563eb22;">Thêm phòng</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    // Đóng modal
    modal.querySelector("#cancel-add-room").onclick = () => modal.remove();
    // Xác nhận số giường để nhập vị trí từng giường
    modal.querySelector("#confirm-bed-count").onclick = () => {
      const bedCount = Math.max(1, parseInt(modal.querySelector("#bed-count-input").value));
      const bedPositionsForm = modal.querySelector("#bed-positions-form");
      bedPositionsForm.innerHTML = Array.from({length: bedCount}, (_, idx) => `
        <div style='margin-bottom:12px;display:flex;align-items:center;gap:12px;'>
          <span style="min-width:80px;font-weight:600;font-size:1.08rem;">Giường ${idx+1}:</span>
          <input name='bed-x-${idx}' type='number' step='any' placeholder='x' style='width:70px;padding:8px 10px;border-radius:8px;border:1.5px solid #dde8f3;font-size:1.05rem;outline:none;transition:border 0.18s;'>
          <input name='bed-y-${idx}' type='number' step='any' placeholder='y' style='width:70px;padding:8px 10px;border-radius:8px;border:1.5px solid #dde8f3;font-size:1.05rem;outline:none;transition:border 0.18s;'>
          <input name='bed-theta-${idx}' type='number' step='any' placeholder='θ' style='width:70px;padding:8px 10px;border-radius:8px;border:1.5px solid #dde8f3;font-size:1.05rem;outline:none;transition:border 0.18s;'>
        </div>
      `).join("");
    };
    // Submit
    modal.querySelector("#add-room-form").onsubmit = async (e) => {
      e.preventDefault();
      const name = modal.querySelector("#room-name-input").value.trim();
      const bedCount = Math.max(1, parseInt(modal.querySelector("#bed-count-input").value));
      if (!name || !bedCount) return;
      // Kiểm tra trùng tên phòng
      const allRooms = await roomService.getRooms();
      if (allRooms.some(r => (r.name || "").toString().toLowerCase() === name.toLowerCase())) {
        alert("Phòng này đã tồn tại. Vui lòng nhập số phòng khác.");
        return;
      }
      // Lấy vị trí từng giường nếu có
      const beds = Array.from({length: bedCount}, (_, idx) => {
        const x = parseFloat(modal.querySelector(`[name='bed-x-${idx}']`)?.value);
        const y = parseFloat(modal.querySelector(`[name='bed-y-${idx}']`)?.value);
        const theta = parseFloat(modal.querySelector(`[name='bed-theta-${idx}']`)?.value);
        let pos = (isNaN(x) || isNaN(y) || isNaN(theta)) ? undefined : { x, y, theta };
        let bed = { name: `Giường ${idx + 1}`, occupied: false, patientName: "" };
        if (pos) bed.position = pos;
        return bed;
      });
      await roomService.addRoom(name, beds);
      modal.remove();
      this.renderView();
    };
  }

  async handleAddBed(roomId) {
    await roomService.addBed(roomId);
    this.renderView();
  }

  async handleRemoveBed(roomId) {
    await roomService.removeBed(roomId);
    this.renderView();
  }
}

export default new RoomController();
