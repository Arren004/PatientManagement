// ============================================
// DELIVERY CONTROLLER - Xử lý events giao thuốc
// ============================================

import deliveryService from "../services/deliveryService.js";
import patientService from "../services/patientService.js";
import { renderDeliveryView } from "../views/deliveryView.js";
import { showToast } from "../utils/ui.js";
import firebaseService from "../services/firebaseService.js";

class DeliveryController {
  constructor() {
    this.viewContainer = document.getElementById("view-delivery");
    this.unsubscribeDeliveryCommands = null;
  }

  init() {
    // Render sẽ được gọi khi switch view
    // Lắng nghe realtime trạng thái đơn hàng
    if (this.unsubscribeDeliveryCommands) this.unsubscribeDeliveryCommands();
    this.unsubscribeDeliveryCommands = firebaseService.listenDeliveryCommandsRealtime((commands) => {
      // Kiểm tra có đơn hàng nào đang delivering không
      const hasDelivering = commands.some(cmd => cmd.status === "delivering");
      window.isDelivering = hasDelivering;
      this.renderView();
      // Lấy state hiện tại
      const state = deliveryService.getDeliveryBins();
      let updated = false;
      // Duyệt từng ngăn, nếu có đơn hàng slot tương ứng và status là 'thành công' thì giải phóng ngăn
      commands.forEach(cmd => {
        if (cmd.status === "thành công" && cmd.slot) {
          const slotIdx = Number(cmd.slot) - 1;
          if (state[slotIdx] && state[slotIdx].status === "đang giao") {
            state[slotIdx] = { patientId: "", note: "", status: "" };
            updated = true;
          }
        }
      });
      if (updated) {
        // Lưu lại state và render lại UI
        deliveryService.saveBins(state);
        this.renderView();
      }
    });
  }

  renderView() {
    const bins = deliveryService.getDeliveryBins();
    const patients = patientService.getPatients();
    const readyBinsCount = deliveryService.getReadyBinsCount();

    // Kiểm tra trạng thái đơn hàng trên Firestore (giả sử lưu vào this.isDelivering)
    const isDelivering = window.isDelivering || false;
    renderDeliveryView(this.viewContainer, bins, patients, readyBinsCount, isDelivering);

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Chỉ lấy bệnh nhân đang nhập viện
    const patients = patientService.getPatients().filter(p => p.status === 'admitted');
    const bins = deliveryService.getDeliveryBins();

    // Patient search controls - modal
    this.viewContainer.querySelectorAll(".delivery-control-patient-search").forEach((input) => {
      const index = Number(input.dataset.index);
      const hiddenInput = this.viewContainer.querySelector(`.delivery-control-patient-id[data-index="${index}"]`);
      const currentPatientId = bins[index].patientId;
      const isBusy = bins[index].status === "đang giao";
      if (currentPatientId) {
        const patient = patients.find(p => String(p.id) === String(currentPatientId));
        if (patient) {
          input.value = patient.name;
          hiddenInput.value = currentPatientId;
        }
      }
      if (isBusy) return; // KHÔNG cho thao tác nếu đang giao
      input.addEventListener("click", () => {
        const modal = document.getElementById("patient-select-modal");
        if (!modal) return;
        modal.style.display = "flex";
        // Sử dụng arrow function để giữ đúng ngữ cảnh this
        const renderPatientModalList = (search) => {
          const list = modal.querySelector("#patient-modal-list");
          let filtered = patients;
          if (search && search.trim()) {
            const s = search.toLowerCase();
            filtered = patients.filter(p =>
              p.name.toLowerCase().includes(s) || (p.room && String(p.room).toLowerCase().includes(s))
            );
          }
          // Phân trang
          const pageSize = 10;
          let page = window.patientModalPage || 1;
          const totalPages = Math.ceil(filtered.length / pageSize) || 1;
          if (page > totalPages) page = totalPages;
          window.patientModalPage = page;
          const paged = filtered.slice((page-1)*pageSize, page*pageSize);

          list.innerHTML = paged.map(p => `<div class="dropdown-item patient-modal-item" data-id="${p.id}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #eee;"><strong>${p.name}</strong><span style='margin-left:8px;color:#888;'>Phòng ${p.room}, Giường ${p.bed}</span></div>`).join("")
            + (filtered.length === 0 ? '<div class="dropdown-no-result">Không tìm thấy bệnh nhân</div>' : "");
          // Phân trang controls
          list.innerHTML += `<div style='text-align:center;margin-top:8px;'>
            <button id='modal-prev-page' ${page===1?'disabled':''} style='margin:0 4px;'>◀</button>
            Trang <b>${page}</b> / ${totalPages}
            <button id='modal-next-page' ${page===totalPages?'disabled':''} style='margin:0 4px;'>▶</button>
          </div>`;

          // Gán event chọn
          list.querySelectorAll('.patient-modal-item').forEach(item => {
            item.onclick = () => {
              const id = item.getAttribute('data-id');
              const patient = patients.find(p => String(p.id) === String(id));
              if (patient) {
                const result = deliveryService.updateBin(index, "patientId", patient.id);
                if (!result.success) {
                  showToast(result.message);
                  this.renderView();
                  return;
                }
                input.value = patient.name;
                hiddenInput.value = patient.id;
                modal.style.display = "none";
                this.updateReadyState();
              }
            };
          });
          // Phân trang event
          list.querySelector('#modal-prev-page')?.addEventListener('click',()=>{window.patientModalPage=Math.max(1,page-1);renderPatientModalList(modal.querySelector('#patient-modal-search').value);});
          list.querySelector('#modal-next-page')?.addEventListener('click',()=>{window.patientModalPage=Math.min(totalPages,page+1);renderPatientModalList(modal.querySelector('#patient-modal-search').value);});
        };

        renderPatientModalList("");

        // Tìm kiếm
        const searchInput = modal.querySelector('#patient-modal-search');
        searchInput.value = "";
        searchInput.oninput = (e) => {
          window.patientModalPage = 1;
          renderPatientModalList(e.target.value);
        };

        // Đóng modal
        modal.querySelector('#patient-modal-cancel').onclick = () => {
          modal.style.display = "none";
        };
      });
    });

    // Note textarea controls
    this.viewContainer.querySelectorAll(".delivery-control-note").forEach((textarea) => {
      const index = Number(textarea.dataset.index);
      textarea.value = deliveryService.getDeliveryBins()[index].note || "";
      const isBusy = bins[index].status === "đang giao";
      if (isBusy) return; // KHÔNG cho thao tác nếu đang giao
      textarea.addEventListener("input", (e) => {
        const result = deliveryService.updateBin(index, "note", e.target.value, false);
        if (!result.success) {
          showToast(result.message);
          this.renderView();
          return;
        }
        this.updateReadyState();
      });
    });

    // Clear bin buttons
    this.viewContainer.querySelectorAll(".clear-bin-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.index);
        const result = deliveryService.clearBin(index);
        if (result.success) {
          showToast(result.message);
          this.renderView();
        } else {
          showToast(result.message);
        }
      });
    });

    // Start mission button
    const startBtn = this.viewContainer.querySelector("#start-delivery-btn");
    if (startBtn) {
      startBtn.addEventListener("click", async () => {
        const result = await deliveryService.startMission();
        if (result.success) {
          showToast(result.message);
          import('../utils/ui.js').then(m => m.showSuccessCheckmark());
          this.renderView();
        } else {
          showToast(result.message);
        }
      });
    }
  }

  updateReadyState() {
    const readyCount = deliveryService.getReadyBinsCount();
    const readyText = this.viewContainer.querySelector("#ready-bins-text");
    const startBtn = this.viewContainer.querySelector("#start-delivery-btn");

    if (readyText) {
      readyText.textContent = `${readyCount} ngăn đã sẵn sàng`;
    }

    if (startBtn) {
      startBtn.disabled = !readyCount;
    }
  }
}

export default new DeliveryController();
