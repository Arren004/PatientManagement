// ============================================
// PATIENT CONTROLLER - Xử lý events bệnh nhân
// ============================================

import patientService from "../services/patientService.js";
import roomController from "./roomController.js";
import stateService from "../services/stateService.js";
import { renderPatientView } from "../views/patientView.js";
import { showToast, setupModalClose, focusFirstInputInModal, showWarningAlert } from "../utils/ui.js";
import roomService from "../services/roomService.js";
import authService from "../services/authService.js";

class PatientController {
  constructor() {
    this.viewContainer = document.getElementById("view-patients");
    this.isModalVisible = false;
    this.editingPatient = null;
    this.filters = { status: "all", room: "", name: "" };
    this.activeTab = 'admitted'; // tab hiện tại: 'admitted' hoặc 'discharged'
    // Khi khởi tạo, luôn đồng bộ dữ liệu từ Firestore
    this.initSyncFromCloud();
    // Subscribe để tự động render khi state thay đổi
    stateService.subscribe(() => {
      this.renderView();
    });
  }

  async initSyncFromCloud() {
    // Chỉ đồng bộ nếu đang ở view bệnh nhân
    if (this.viewContainer) {
      await patientService.syncPatientsFromCloud();
    }
  }

  init() {
    // Render sẽ được gọi khi switch view
  }

  renderView(searchQuery = null) {
    if (searchQuery === null) {
      const searchInput = document.getElementById("global-search");
      searchQuery = searchInput ? searchInput.value.trim() : "";
    }

    // Lọc bệnh nhân
    const filteredPatients = patientService.filterPatients({
      status: this.filters.status,
      room: this.filters.room,
      name: this.filters.name,
      search: searchQuery,
    });

    // Render view với activeTab
    renderPatientView(this.viewContainer, filteredPatients, this.isModalVisible, this.editingPatient, this.activeTab);

    // Setup event listeners
    this.setupEventListeners();

    // Gán sự kiện click cho hàng bệnh nhân và tab switching
    setTimeout(() => {
      // Modal chi tiết bệnh nhân
      this.viewContainer.querySelectorAll('.patient-row-clickable').forEach((row, idx) => {
        row.onclick = (e) => {
          // Không mở modal nếu click vào nút xuất viện hoặc ô chứa nút xuất viện
          if (e.target.closest('.discharge-patient-btn') || e.target.closest('.action-cell')) return;
          const patientId = row.getAttribute('data-id');
          const patient = patientService.getPatientById(patientId);
          if (patient) {
            import('../views/patientView.js').then(m => m.renderPatientDetailModal(patient));
          }
        };
      });
      // Tab switching
      this.viewContainer.querySelectorAll('.patient-tab').forEach(tab => {
        tab.onclick = () => {
          const tabKey = tab.dataset.tab;
          if (tabKey !== this.activeTab) {
            this.activeTab = tabKey;
            window.patientPage = 1;
            this.renderView(searchQuery);
          }
        };
      });
    }, 0);

    // Gán event cho nút phân trang sau khi render
    const pag = this.viewContainer.querySelector('#patient-pagination');
    if (pag) {
      const getFilteredPatientsCount = () => {
        const filtered = patientService.filterPatients({
          status: this.filters.status,
          room: this.filters.room,
          name: this.filters.name,
          search: searchQuery,
        });
        let tabFiltered = filtered;
        if (this.activeTab === 'admitted') {
          tabFiltered = filtered.filter(p => p.status !== 'discharged');
        } else if (this.activeTab === 'discharged') {
          tabFiltered = filtered.filter(p => p.status === 'discharged');
        }
        return tabFiltered.length;
      };

      pag.querySelector('#first-page').onclick = () => { window.patientPage = 1; this.renderView(searchQuery); };
      pag.querySelector('#prev-page').onclick = () => { window.patientPage = Math.max(1, window.patientPage-1); this.renderView(searchQuery); };
      pag.querySelector('#next-page').onclick = () => {
        const totalPages = Math.ceil(getFilteredPatientsCount() / 10) || 1;
        window.patientPage = Math.min(totalPages, window.patientPage+1); this.renderView(searchQuery);
      };
      pag.querySelector('#last-page').onclick = () => {
        const totalPages = Math.ceil(getFilteredPatientsCount() / 10) || 1;
        window.patientPage = totalPages; this.renderView(searchQuery);
      };
    }
  }

  reRenderTableOnly(searchQuery = null) {
    if (searchQuery === null) {
      const searchInput = document.getElementById("global-search");
      searchQuery = searchInput ? searchInput.value.trim() : "";
    }

    const filteredPatients = patientService.filterPatients({
      status: this.filters.status,
      room: this.filters.room,
      name: this.filters.name,
      search: searchQuery,
    });

    let tabFiltered = filteredPatients;
    if (this.activeTab === 'admitted') {
      tabFiltered = filteredPatients.filter(p => p.status !== 'discharged');
    } else if (this.activeTab === 'discharged') {
      tabFiltered = filteredPatients.filter(p => p.status === 'discharged');
    }

    const sortedPatients = [...tabFiltered].sort((a, b) => {
      if (a.status === b.status) return 0;
      if (a.status === "admitted") return -1;
      if (b.status === "admitted") return 1;
      return 0;
    });

    const pageSize = 10;
    let currentPage = window.patientPage || 1;
    const totalPages = Math.ceil(sortedPatients.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    window.patientPage = currentPage;
    const pagedPatients = sortedPatients.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const tbody = this.viewContainer.querySelector("tbody");
    if (tbody) {
      function statusBadge(status) {
        if (status === "admitted") return '<span class="badge badge-green">Nhập viện</span>';
        if (status === "discharged") return '<span class="badge badge-gray">Xuất viện</span>';
        return `<span class="badge">${status === "admitted" ? "Nhập viện" : status === "discharged" ? "Xuất viện" : status}</span>`;
      }

      tbody.innerHTML = pagedPatients.map((p, idx) => {
        const stt = (currentPage - 1) * pageSize + idx + 1;
        const bedNum = p.bed ? p.bed.replace("Giường ", "") : "-";
        return `
          <tr class="patient-row-clickable ${p.status === "discharged" ? "discharged-row" : ""}" data-id="${p.id || ""}" style="cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.15s;">
            <td style="padding: 14px 16px; text-align: center; color: #64748b; font-weight: 500;">${stt}</td>
            <td style="padding: 14px 16px;">
              <div style="font-weight: 600; color: #1e293b; font-size: 0.98rem;">${p.name}</div>
            </td>
            <td style="padding: 14px 16px; color: #334155; font-size: 0.95rem;">${p.dob || 'Chưa nhập'}</td>
            <td style="padding: 14px 16px; color: #334155; font-size: 0.95rem; text-transform: capitalize;">${p.gender || ''}</td>
            <td style="padding: 14px 16px; color: #334155; font-size: 0.95rem;">${p.phone || 'Chưa nhập'}</td>
            <td style="padding: 14px 16px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.92rem; color: #475569; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8; margin-right: 2px;">
                    <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"></path>
                    <path d="M2 20h20"></path>
                    <path d="M14 12v.01" stroke-width="3.5"></path>
                  </svg> Phòng ${p.room}
                </span>
                <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.92rem; color: #475569; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">
                  <img src="image/bed.png" alt="Giường" style="width: 14px; height: 14px; opacity: 0.7;"/> Giường ${bedNum}
                </span>
              </div>
            </td>
            <td style="padding: 14px 16px; color: #334155; font-size: 0.95rem; font-weight: 500;">${p.doctor || 'Chưa phân công'}</td>
            <td style="padding: 14px 16px; text-align: center;">${statusBadge(p.status)}</td>
            <td style="padding: 14px 16px; text-align: center;" class="action-cell">
              <button class="open-actions-popup-btn" data-id="${p.id}" type="button">
                Thao tác <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem;"></i>
              </button>
            </td>
          </tr>
        `;
      }).join("") || `<tr><td colspan="9" style="padding:24px;text-align:center;color:#888;">Không có dữ liệu.</td></tr>`;

      this.viewContainer.querySelectorAll('.patient-row-clickable').forEach((row) => {
        row.onclick = (e) => {
          if (e.target.closest('.discharge-patient-btn') || e.target.closest('.action-cell')) return;
          const patientId = row.getAttribute('data-id');
          const patient = patientService.getPatientById(patientId);
          if (patient) {
            import('../views/patientView.js').then(m => m.renderPatientDetailModal(patient));
          }
        };
      });

      const openActionPopupBtns = this.viewContainer.querySelectorAll(".open-actions-popup-btn");
      openActionPopupBtns.forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const patientId = btn.dataset.id;
          const patient = patientService.getPatientById(patientId);
          if (patient) {
            this.showActionsPopup(patient);
          }
        };
      });
    }

    const pag = this.viewContainer.querySelector('#patient-pagination');
    if (pag) {
      pag.innerHTML = `
        <button id="first-page" ${currentPage===1?'disabled':''} title="Trang đầu"><img src="image/arrow2.png" alt="first" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
        <button id="prev-page" ${currentPage===1?'disabled':''} title="Trang trước"><img src="image/arrow1.png" alt="prev" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
        <span style="margin:0 8px;">Trang <b>${currentPage}</b> / ${totalPages}</span>
        <button id="next-page" ${currentPage===totalPages?'disabled':''} title="Trang sau"><img src="image/arrow1.png" alt="next" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
        <button id="last-page" ${currentPage===totalPages?'disabled':''} title="Trang cuối"><img src="image/arrow2.png" alt="last" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
      `;

      pag.querySelector('#first-page').onclick = () => { window.patientPage = 1; this.reRenderTableOnly(searchQuery); };
      pag.querySelector('#prev-page').onclick = () => { window.patientPage = Math.max(1, window.patientPage-1); this.reRenderTableOnly(searchQuery); };
      pag.querySelector('#next-page').onclick = () => { window.patientPage = Math.min(totalPages, window.patientPage+1); this.reRenderTableOnly(searchQuery); };
      pag.querySelector('#last-page').onclick = () => { window.patientPage = totalPages; this.reRenderTableOnly(searchQuery); };
    }
  }

  setupEventListeners() {
    // Mở modal thêm bệnh nhân
    const openModalBtn = this.viewContainer.querySelector("#open-patient-modal");
    if (openModalBtn) {
      openModalBtn.addEventListener("click", () => this.openModal());
    }

    // Mở modal in danh sách bệnh nhân
    const printBtn = this.viewContainer.querySelector("#print-patient-list-btn");
    const printModal = this.viewContainer.querySelector("#print-patient-modal");
    if (printBtn && printModal) {
      printBtn.addEventListener("click", () => {
        printModal.classList.add("show");
      });
      // Đóng modal khi bấm Huỷ hoặc click ra ngoài
      const cancelBtn = printModal.querySelector("#print-patient-cancel");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          printModal.classList.remove("show");
        });
      }
      printModal.addEventListener("mousedown", (e) => {
        if (e.target === printModal) printModal.classList.remove("show");
      });
      // Xác nhận in
      const confirmBtn = printModal.querySelector("#print-patient-confirm");
      if (confirmBtn) {
        confirmBtn.addEventListener("click", () => {
          const fromDateStr = printModal.querySelector("#print-from-date").value;
          const toDateStr = printModal.querySelector("#print-to-date").value;
          const fromDate = fromDateStr ? new Date(fromDateStr) : null;
          const toDate = toDateStr ? new Date(toDateStr) : null;
          // Lấy toàn bộ danh sách bệnh nhân (không phân trang, không filter UI)
          const allPatients = window.stateService ? window.stateService.getState().patients : [];
          import('../utils/excelUtils.js').then(({ exportPatientsToExcel }) => {
            exportPatientsToExcel(allPatients, fromDate, toDate, { includeDelivery: true, includeDischarge: true });
          });
          printModal.classList.remove("show");
        });
      }
    }

    // Mở popup thao tác bệnh nhân
    const openActionPopupBtns = this.viewContainer.querySelectorAll(".open-actions-popup-btn");
    openActionPopupBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const patientId = btn.dataset.id;
        const patient = patientService.getPatientById(patientId);
        if (patient) {
          this.showActionsPopup(patient);
        }
      });
    });


    // Đóng modal thêm bệnh nhân
    const cancelBtn = this.viewContainer.querySelector("#patient-modal-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.closeModal());
    }

    // Đóng modal chỉnh sửa bệnh nhân
    const editCancelBtn = this.viewContainer.querySelector("#patient-edit-modal-cancel");
    if (editCancelBtn) {
      editCancelBtn.addEventListener("click", () => this.closeModal());
    }

    // Modal form submit (thêm bệnh nhân)
    const form = this.viewContainer.querySelector("#patient-modal-form");
    if (form) {
      form.addEventListener("submit", (e) => this.handleFormSubmit(e));
    }

    // Modal form submit (sửa bệnh nhân)
    const editForm = this.viewContainer.querySelector("#patient-edit-modal-form");
    if (editForm) {
      editForm.addEventListener("submit", (e) => this.handleEditFormSubmit(e));
    }

    // Modal click outside (thêm bệnh nhân)
    const modal = this.viewContainer.querySelector("#patient-modal");
    if (modal) {
      setupModalClose(modal, () => this.closeModal());
      if (this.isModalVisible && !this.editingPatient) {
        focusFirstInputInModal(modal);
      }
    }

    // Modal click outside (sửa bệnh nhân)
    const editModal = this.viewContainer.querySelector("#patient-edit-modal");
    if (editModal) {
      setupModalClose(editModal, () => this.closeModal());
    }

    // Tính toán tự động chỉ số BMI (Add Modal)
    const addHeight = this.viewContainer.querySelector("#modal-patient-height");
    const addWeight = this.viewContainer.querySelector("#modal-patient-weight");
    const addBmi = this.viewContainer.querySelector("#modal-patient-bmi");
    if (addHeight && addWeight && addBmi) {
      const calculateBMI = () => {
        const hVal = parseFloat(addHeight.value);
        const wVal = parseFloat(addWeight.value);
        if (hVal > 0 && wVal > 0) {
          const heightInMeters = hVal / 100;
          addBmi.value = (wVal / (heightInMeters * heightInMeters)).toFixed(2);
        } else {
          addBmi.value = '';
        }
      };
      addHeight.addEventListener('input', calculateBMI);
      addWeight.addEventListener('input', calculateBMI);
    }

    // Tính toán tự động chỉ số BMI (Edit Modal)
    const editHeight = this.viewContainer.querySelector("#edit-patient-height");
    const editWeight = this.viewContainer.querySelector("#edit-patient-weight");
    const editBmi = this.viewContainer.querySelector("#edit-patient-bmi");
    if (editHeight && editWeight && editBmi) {
      const calculateBMI = () => {
        const hVal = parseFloat(editHeight.value);
        const wVal = parseFloat(editWeight.value);
        if (hVal > 0 && wVal > 0) {
          const heightInMeters = hVal / 100;
          editBmi.value = (wVal / (heightInMeters * heightInMeters)).toFixed(2);
        } else {
          editBmi.value = '';
        }
      };
      editHeight.addEventListener('input', calculateBMI);
      editWeight.addEventListener('input', calculateBMI);
    }

    // Lọc
    const statusFilter = this.viewContainer.querySelector("#patient-status-filter");
    const nameFilter = this.viewContainer.querySelector("#patient-name-filter");
    const roomFilter = this.viewContainer.querySelector("#patient-room-filter");
    const applyBtn = this.viewContainer.querySelector("#apply-patient-filter");
    const resetBtn = this.viewContainer.querySelector("#reset-patient-filter");

    if (statusFilter) {
      statusFilter.value = this.filters.status;
    }
    if (nameFilter) {
      nameFilter.value = this.filters.name;
    }
    if (roomFilter) {
      roomFilter.value = this.filters.room;
    }

    const triggerLiveFilter = () => {
      this.filters.status = statusFilter ? statusFilter.value : "all";
      this.filters.name = nameFilter ? nameFilter.value : "";
      this.filters.room = roomFilter ? roomFilter.value : "";
      window.patientPage = 1;
      this.reRenderTableOnly();
    };

    if (nameFilter) {
      nameFilter.addEventListener("input", triggerLiveFilter);
    }
    if (roomFilter) {
      roomFilter.addEventListener("input", triggerLiveFilter);
    }
    if (statusFilter) {
      statusFilter.addEventListener("change", triggerLiveFilter);
    }

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        this.filters.status = statusFilter.value;
        this.filters.name = nameFilter ? nameFilter.value.trim() : "";
        this.filters.room = roomFilter ? roomFilter.value.trim() : "";
        this.renderView();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.filters = { status: "all", room: "", name: "" };
        if (statusFilter) statusFilter.value = "all";
        if (nameFilter) nameFilter.value = "";
        if (roomFilter) roomFilter.value = "";
        window.patientPage = 1;
        this.reRenderTableOnly();
      });
    }

    // Helper chọn phòng cho cả Add và Edit
    const setupRoomSelection = (inputEl, roomModalEl) => {
      if (!inputEl || !roomModalEl) return;
      inputEl.onclick = async () => {
        roomModalEl.style.display = "flex";
        const rooms = await roomService.getRooms();
        const patients = window.stateService ? window.stateService.getState().patients : [];
        const floorMap = {};
        const floorBedStats = {};
        rooms.forEach(room => {
          const floor = String(room.name).trim()[0];
          if (!floorMap[floor]) floorMap[floor] = [];
          floorMap[floor].push(room);
        });
        // Tính tổng số giường trống cho từng lầu
        Object.keys(floorMap).forEach(floor => {
          let emptyBeds = 0;
          floorMap[floor].forEach(room => {
            if (Array.isArray(room.beds)) {
              const usedBeds = patients.filter(p => p.room === room.name && p.status === 'admitted').map(p => p.bed);
              emptyBeds += room.beds.filter((bed, idx) => {
                let bedName;
                if (typeof bed === 'object') {
                  bedName = bed.name || bed.id || `Giường ${idx + 1}`;
                } else {
                  bedName = bed || `Giường ${idx + 1}`;
                }
                return bedName && !usedBeds.includes(bedName);
              }).length;
            }
          });
          floorBedStats[floor] = emptyBeds;
        });
        const floorList = roomModalEl.querySelector("#floor-list");
        const roomList = roomModalEl.querySelector("#room-list");
        // Reset UI
        let selectedFloor = null;
        floorList.innerHTML = Object.keys(floorMap).sort().map(f =>
          `<button type='button' class='floor-btn' data-floor='${f}' style='padding:10px 0;margin:2px 0;border-radius:8px;border:2px solid #2563eb;background:#fff;color:#2563eb;font-weight:600;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:200px;max-width:260px;min-height:56px;'>
            <span style='white-space:nowrap;display:inline-block;min-width:60px;text-align:left;'>Lầu ${f}</span>
            <span style='font-size:0.93rem;color:#2563eb;background:#e0e7ef;border-radius:7px;padding:2px 16px;min-width:80px;max-width:210px;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;'>
              <span style="font-weight:700;min-width:22px;text-align:center;display:inline-block;">${floorBedStats[f]}</span>
              <span style="white-space:nowrap;">giường trống</span>
            </span>
          </button>`
        ).join("");
        roomList.innerHTML = "<div style='color:#888;font-size:1rem;padding:10px 0;'>Chọn lầu để xem phòng</div>";

        function renderRooms(floor) {
          roomList.innerHTML = floorMap[floor].map(r => `<button type='button' class='room-btn' data-room='${r.name}' style='padding:8px 16px;margin:4px 0;border-radius:7px;border:1.5px solid #2563eb;background:#f8fafd;color:#2563eb;font-size:1rem;cursor:pointer;display:flex;align-items:center;gap:10px;width:180px;box-sizing:border-box;'>
            <span>Phòng ${r.name}</span>
            <span style='font-size:0.92rem;color:#2563eb;background:#e0e7ef;border-radius:6px;padding:2px 8px;min-width:24px;display:inline-flex;align-items:center;justify-content:center;margin-left:4px;font-weight:700;'>${(() => {
              let emptyBeds = 0;
              if (Array.isArray(r.beds)) {
                const usedBeds = patients.filter(p => p.room === r.name && p.status === 'admitted').map(p => p.bed);
                emptyBeds = r.beds.filter((bed, idx) => {
                  let bedName;
                  if (typeof bed === 'object') {
                    bedName = bed.name || bed.id || `Giường ${idx + 1}`;
                  } else {
                    bedName = bed || `Giường ${idx + 1}`;
                  }
                  return bedName && !usedBeds.includes(bedName);
                }).length;
              }
              return emptyBeds;
            })()}</span>
          </button>`).join("");
          roomList.querySelectorAll('.room-btn').forEach(rbtn => {
            rbtn.onclick = function() {
              inputEl.value = rbtn.dataset.room;
              roomModalEl.style.display = "none";
              inputEl.dispatchEvent(new Event('change'));
            };
          });
        }

        floorList.querySelectorAll('.floor-btn').forEach(btn => {
          btn.onclick = function() {
            floorList.querySelectorAll('.floor-btn').forEach(b => b.style.background = '#fff');
            btn.style.background = '#e0e7ef';
            selectedFloor = btn.dataset.floor;
            renderRooms(selectedFloor);
          };
        });

        roomModalEl.querySelector("#room-modal-cancel").onclick = function() {
          roomModalEl.style.display = "none";
        };
      };
    };

    // Helper chọn giường cho cả Add và Edit
    const setupBedSelection = (inputEl, roomInputEl, bedModalEl) => {
      if (!inputEl || !roomInputEl || !bedModalEl) return;
      inputEl.onclick = async () => {
        const selectedRoomName = roomInputEl.value.trim();
        if (!selectedRoomName) {
          inputEl.value = "";
          let msg = document.getElementById("bed-room-warning");
          if (!msg) {
            msg = document.createElement("div");
            msg.id = "bed-room-warning";
            msg.textContent = "Vui lòng chọn phòng trước";
            msg.style = "color:#e53e3e;background:#fff3f3;border:1px solid #e53e3e;padding:6px 14px;border-radius:7px;position:absolute;z-index:3000;box-shadow:0 2px 8px #0001;font-size:1rem;top:100%;left:0;margin-top:4px;";
            inputEl.parentElement.style.position = "relative";
            inputEl.parentElement.appendChild(msg);
          }
          setTimeout(() => { if (msg) msg.remove(); }, 1800);
          return;
        }
        bedModalEl.style.display = "flex";
        const rooms = await roomService.getRooms();
        const selectedRoom = rooms.find(r => r.name === selectedRoomName);
        const bedList = bedModalEl.querySelector("#bed-list");
        if (selectedRoom && Array.isArray(selectedRoom.beds)) {
          const patients = window.stateService ? window.stateService.getState().patients : [];
          // Loại trừ bệnh nhân hiện tại ra khỏi danh sách giường đã sử dụng nếu đang edit
          const editPatientId = this.editingPatient ? this.editingPatient.id : null;
          const usedBeds = patients.filter(p => p.room === selectedRoom.name && p.status === 'admitted' && p.id !== editPatientId).map(p => p.bed);
          const emptyBeds = selectedRoom.beds.filter((bed, idx) => {
            let bedName;
            if (typeof bed === 'object') {
              bedName = bed.name || bed.id || `Giường ${idx + 1}`;
            } else {
              bedName = bed || `Giường ${idx + 1}`;
            }
            return bedName && !usedBeds.includes(bedName);
          });
          if (emptyBeds.length === 0) {
            bedList.innerHTML = '<div style="color:#888;font-size:1rem;padding:10px 0;">Không có giường trống</div>';
          } else {
            bedList.innerHTML = emptyBeds.map((bed, idx) => {
              let bedName;
              if (typeof bed === 'object') {
                bedName = bed.name || bed.id || `Giường ${idx + 1}`;
              } else {
                bedName = bed || `Giường ${idx + 1}`;
              }
              return `<button type='button' class='bed-btn' data-bed='${bedName}' style='padding:8px 16px;margin:4px 6px;border-radius:7px;border:1.5px solid #2563eb;background:#f8fafd;color:#2563eb;font-size:1rem;cursor:pointer;'>${bedName}</button>`;
            }).join("");
            bedList.querySelectorAll('.bed-btn').forEach(btn => {
              btn.onclick = function() {
                inputEl.value = btn.dataset.bed;
                bedModalEl.style.display = "none";
              };
            });
          }
        } else {
          bedList.innerHTML = '<div style="color:#888;font-size:1rem;padding:10px 0;">Không có giường trống</div>';
        }
        bedModalEl.querySelector("#bed-modal-cancel").onclick = function() {
          bedModalEl.style.display = "none";
        };
      };
    };

    // Modal chọn phòng/lầu
    const roomInputAdd = this.viewContainer.querySelector("#modal-patient-room");
    const roomInputEdit = this.viewContainer.querySelector("#edit-patient-room");
    const roomModal = this.viewContainer.querySelector("#room-select-modal");
    
    setupRoomSelection(roomInputAdd, roomModal);
    setupRoomSelection(roomInputEdit, roomModal);

    // Dropdown giường
    const bedInputAdd = this.viewContainer.querySelector("#modal-patient-bed");
    const bedInputEdit = this.viewContainer.querySelector("#edit-patient-bed");
    const bedModal = this.viewContainer.querySelector("#bed-select-modal") || document.getElementById("bed-select-modal");

    setupBedSelection(bedInputAdd, roomInputAdd, bedModal);
    setupBedSelection(bedInputEdit, roomInputEdit, bedModal);

    // Đồng bộ reset giường khi chọn phòng thay đổi để tránh lệch dữ liệu giường/phòng
    if (roomInputAdd && bedInputAdd) {
      roomInputAdd.addEventListener("change", () => {
        bedInputAdd.value = "";
      });
    }
    if (roomInputEdit && bedInputEdit) {
      roomInputEdit.addEventListener("change", () => {
        bedInputEdit.value = "";
      });
    }

    // Chọn thuốc cho Đơn thuốc (Add & Edit)
    const selectMedBtnAdd = this.viewContainer.querySelector("#modal-select-medicine-btn");
    const prescriptionInputAdd = this.viewContainer.querySelector("#modal-patient-prescription");
    const selectMedBtnEdit = this.viewContainer.querySelector("#edit-select-medicine-btn");
    const prescriptionInputEdit = this.viewContainer.querySelector("#edit-patient-prescription");

    this.setupMedicineSelectionForPrescription(selectMedBtnAdd, prescriptionInputAdd);
    this.setupMedicineSelectionForPrescription(selectMedBtnEdit, prescriptionInputEdit);

    // Lắng nghe CustomEvent để kích hoạt Edit Modal
    const handleEditTrigger = (e) => {
      const patientId = e.detail.patientId;
      const patient = patientService.getPatientById(patientId);
      if (patient) {
        this.editingPatient = patient;
        this.renderView();
      }
    };
    document.removeEventListener('edit-patient-trigger', this._onEditTrigger);
    this._onEditTrigger = handleEditTrigger;
    document.addEventListener('edit-patient-trigger', this._onEditTrigger);
  }

  openModal() {
    this.isModalVisible = true;
    this.editingPatient = null;
    this.renderView();
  }

  closeModal() {
    this.isModalVisible = false;
    this.editingPatient = null;
    this.renderView();
  }

  /** Sau xuất viện thành công: tự động tải Giấy ra viện (.doc) không cần hỏi */
  async promptDischargePaperDownload(patientForDoc) {
    try {
      const { downloadDischargePaperWord } = await import("../utils/dischargePaper.js");
      downloadDischargePaperWord(patientForDoc);
      showToast("Đã xuất viện và tự động tải file Giấy ra viện (.doc) thành công!");
    } catch (error) {
      console.error("Lỗi khi tải file giấy ra viện:", error);
      showToast("Đã xuất viện thành công nhưng không thể tải file Giấy ra viện.");
    }
  }

  async handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    const getVal = (name) => {
      const el = form.querySelector(`[name="${name}"]`);
      return el ? el.value.trim() : '';
    };

    const getRawVal = (name) => {
      const el = form.querySelector(`[name="${name}"]`);
      return el ? el.value : '';
    };

    let doctor = getVal('doctor');
    if (!doctor && window.authService && window.authService.getCurrentUser) {
      const user = window.authService.getCurrentUser();
      if (user && user.fullName) doctor = user.fullName;
    }

    const heightEl = form.querySelector('[name="height"]');
    const weightEl = form.querySelector('[name="weight"]');

    const result = await patientService.addPatient({
      name: getVal('name'),
      room: getVal('room'),
      bed: getVal('bed'),
      status: getVal('status'),
      gender: getRawVal('gender'),
      dob: getRawVal('dob'),
      admissionDate: getRawVal('admissionDate'),
      dischargeDate: getRawVal('dischargeDate'),
      phone: getVal('phone'),
      citizenId: getVal('citizenId'),
      bhyt: getVal('bhyt'),
      doctor,
      height: heightEl ? parseFloat(heightEl.value) || null : null,
      weight: weightEl ? parseFloat(weightEl.value) || null : null,
      bmi: getRawVal('bmi'),
      allergies: getVal('allergies'),
      medicalHistory: getVal('medicalHistory'),
      bloodType: getRawVal('bloodType'),
      icdCode: getVal('icdCode'),
      prescription: getVal('prescription'),
      diagnosis: getVal('diagnosis')
    });

    if (!result.success) {
      if (result.message.includes("Giường") || result.message.includes("đăng ký")) {
        showWarningAlert(result.message);
        const roomInput = form.querySelector("#modal-patient-room");
        const bedInput = form.querySelector("#modal-patient-bed");
        if (roomInput) roomInput.value = "";
        if (bedInput) bedInput.value = "";
      } else {
        showToast(result.message);
      }
      return;
    }

    showToast(result.message);
    await Promise.all([
      roomController.renderView(),
      Promise.resolve().then(() => this.closeModal()),
    ]);
  }

  async handleEditFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const patientId = form.querySelector("#edit-patient-id").value;

    const getVal = (name) => {
      const el = form.querySelector(`[name="${name}"]`);
      return el ? el.value.trim() : '';
    };

    const getRawVal = (name) => {
      const el = form.querySelector(`[name="${name}"]`);
      return el ? el.value : '';
    };

    const heightEl = form.querySelector('[name="height"]');
    const weightEl = form.querySelector('[name="weight"]');

    const result = await patientService.updatePatient(patientId, {
      name: getVal('name'),
      room: getVal('room'),
      bed: getVal('bed'),
      status: getVal('status'),
      gender: getRawVal('gender'),
      dob: getRawVal('dob'),
      admissionDate: getRawVal('admissionDate'),
      dischargeDate: getRawVal('dischargeDate'),
      phone: getVal('phone'),
      citizenId: getVal('citizenId'),
      bhyt: getVal('bhyt'),
      doctor: getVal('doctor'),
      height: heightEl ? parseFloat(heightEl.value) || null : null,
      weight: weightEl ? parseFloat(weightEl.value) || null : null,
      bmi: getRawVal('bmi'),
      allergies: getVal('allergies'),
      medicalHistory: getVal('medicalHistory'),
      bloodType: getRawVal('bloodType'),
      icdCode: getVal('icdCode'),
      prescription: getVal('prescription'),
      diagnosis: getVal('diagnosis')
    });

    if (!result.success) {
      if (result.message.includes("Giường") || result.message.includes("đăng ký")) {
        showWarningAlert(result.message);
        const roomInput = form.querySelector("#edit-patient-room");
        const bedInput = form.querySelector("#edit-patient-bed");
        if (roomInput) roomInput.value = "";
        if (bedInput) bedInput.value = "";
      } else {
        showToast(result.message);
      }
      return;
    }

    showToast(result.message);
    this.closeModal();
    await Promise.all([
      roomController.renderView(),
      Promise.resolve().then(() => this.renderView()),
    ]);
  }

  showActionsPopup(patient) {
    // Xoá bất kỳ action popup cũ nào đang mở
    const oldPopup = document.getElementById("patient-action-popup");
    if (oldPopup) oldPopup.remove();

    const popupOverlay = document.createElement("div");
    popupOverlay.id = "patient-action-popup";
    popupOverlay.className = "action-popup-overlay";

    const isDischarged = patient.status === "discharged";
    const canCreatePatient = authService.can("patients.create");

    // Chỉ hiển thị nút xuất viện nếu chưa xuất viện VÀ có quyền
    const showDischargeOption = !isDischarged && canCreatePatient;
    
    // Tải giấy ra viện chỉ hiển thị nếu bệnh nhân đã xuất viện
    const showDischargePaperOption = isDischarged;

    // Tải đơn thuốc hiển thị cho cả hai
    const showPrescriptionOption = true;

    let optionsHtml = "";

    const arrowSvg = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;

    if (showDischargeOption) {
      optionsHtml += `
        <button class="action-option-card opt-discharge" type="button" id="popup-action-discharge">
          <div class="action-option-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </div>
          <div class="action-option-details">
            <div class="action-option-title">Thủ tục xuất viện</div>
            <div class="action-option-desc">Hoàn tất quá trình điều trị, ghi nhận tình trạng và xuất viện</div>
          </div>
          <div class="action-option-arrow">
            ${arrowSvg}
          </div>
        </button>
      `;
    }

    if (showDischargePaperOption) {
      optionsHtml += `
        <button class="action-option-card opt-discharge-paper" type="button" id="popup-action-download-discharge">
          <div class="action-option-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="action-option-details">
            <div class="action-option-title">Tải Giấy ra viện</div>
            <div class="action-option-desc">Tải file Microsoft Word Giấy ra viện của bệnh nhân</div>
          </div>
          <div class="action-option-arrow">
            ${arrowSvg}
          </div>
        </button>
      `;
    }

    if (showPrescriptionOption) {
      optionsHtml += `
        <button class="action-option-card opt-prescription" type="button" id="popup-action-download-prescription">
          <div class="action-option-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.5 3a4.5 4.5 0 0 0-6.36 6.36l7.78 7.78a4.5 4.5 0 0 0 6.36-6.36l-7.78-7.78z"></path>
              <line x1="14.04" y1="6.82" x2="7.67" y2="13.18"></line>
            </svg>
          </div>
          <div class="action-option-details">
            <div class="action-option-title">Chỉnh sửa &amp; In Đơn thuốc</div>
            <div class="action-option-desc">Chỉnh sửa đơn thuốc kê toa trực tiếp sau đó tải file Word (.doc)</div>
          </div>
          <div class="action-option-arrow">
            ${arrowSvg}
          </div>
        </button>
      `;
    }

    if (!optionsHtml) {
      optionsHtml = `
        <div style="text-align: center; color: #64748b; padding: 20px 0;">
          Không có thao tác khả dụng cho tài khoản của bạn.
        </div>
      `;
    }

    popupOverlay.innerHTML = `
      <div class="action-popup-card">
        <button class="action-popup-close" type="button" id="popup-action-close-btn" aria-label="Đóng">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div class="action-popup-header">
          <h4>Thao tác bệnh nhân</h4>
          <p class="patient-name">${patient.name}</p>
        </div>
        <div class="action-options-stack">
          ${optionsHtml}
        </div>
      </div>
    `;

    document.body.appendChild(popupOverlay);

    // Thêm các event listeners
    const closeBtn = popupOverlay.querySelector("#popup-action-close-btn");
    closeBtn.onclick = () => popupOverlay.remove();

    popupOverlay.onclick = (e) => {
      if (e.target === popupOverlay) {
        popupOverlay.remove();
      }
    };

    // Nút xuất viện
    const dischargeBtn = popupOverlay.querySelector("#popup-action-discharge");
    if (dischargeBtn) {
      dischargeBtn.onclick = () => {
        popupOverlay.remove();
        this.dischargePatientAction(patient.id);
      };
    }

    // Nút tải giấy ra viện
    const downloadDischargeBtn = popupOverlay.querySelector("#popup-action-download-discharge");
    if (downloadDischargeBtn) {
      downloadDischargeBtn.onclick = () => {
        popupOverlay.remove();
        this.downloadDischargePaperAction(patient);
      };
    }

    // Nút tải đơn thuốc
    const downloadPrescriptionBtn = popupOverlay.querySelector("#popup-action-download-prescription");
    if (downloadPrescriptionBtn) {
      downloadPrescriptionBtn.onclick = () => {
        popupOverlay.remove();
        this.showPrescriptionEditModal(patient);
      };
    }
  }

  async dischargePatientAction(patientId) {
    const patientBefore = patientService.getPatientById(patientId) || { id: patientId };
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Tạo dropdown xác nhận tuỳ chỉnh
    let confirmBox = document.getElementById('discharge-confirm-box');
    if (confirmBox) confirmBox.remove();
    confirmBox = document.createElement('div');
    confirmBox.id = 'discharge-confirm-box';
    confirmBox.style.position = 'fixed';
    confirmBox.style.top = '0';
    confirmBox.style.left = '0';
    confirmBox.style.width = '100vw';
    confirmBox.style.height = '100vh';
    confirmBox.style.background = 'rgba(30,41,59,0.18)';
    confirmBox.style.display = 'flex';
    confirmBox.style.alignItems = 'center';
    confirmBox.style.justifyContent = 'center';
    confirmBox.style.zIndex = '9999';
    confirmBox.innerHTML = `
      <div style="background:#fff;border-radius:18px;max-width:360px;width:92vw;padding:32px 28px 22px 28px;box-shadow:0 8px 40px #2563eb33;position:relative;animation:rise 0.18s;">
        <div style='font-size:1.18rem;font-weight:700;margin-bottom:18px;color:#133150;'>Xác nhận xuất viện</div>
        <div style='font-size:1.05rem;margin-bottom:24px;color:#334155;'>Bạn có chắc muốn xuất viện bệnh nhân này?</div>
        <div style='margin-bottom:18px;'>
          <label for='discharge-condition-input' style='display:block;font-size:0.95rem;font-weight:700;color:#133150;margin-bottom:8px;'>Tình trạng lúc xuất viện</label>
          <textarea id='discharge-condition-input' placeholder='Ví dụ: ổn định, tỉnh táo, tự đi lại được...' style='width:100%;min-height:96px;padding:10px 12px;border:1px solid #dbe7f5;border-radius:12px;resize:vertical;font-size:0.98rem;line-height:1.5;'></textarea>
        </div>
        <div style='display:flex;gap:16px;justify-content:flex-end;'>
          <button id='discharge-cancel-btn' style='padding:8px 22px;border-radius:8px;border:none;background:#e0f2fe;color:#2563eb;font-weight:700;font-size:1.05rem;'>Huỷ</button>
          <button id='discharge-ok-btn' style='padding:8px 22px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-weight:700;font-size:1.05rem;'>Xuất viện</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmBox);
    confirmBox.querySelector('#discharge-cancel-btn').onclick = () => {
      confirmBox.remove();
    };
    confirmBox.querySelector('#discharge-ok-btn').onclick = async () => {
      const dischargeConditionInput = confirmBox.querySelector('#discharge-condition-input');
      const dischargeCondition = dischargeConditionInput ? dischargeConditionInput.value.trim() : "";
      if (!dischargeCondition) {
        showToast("Vui lòng nhập tình trạng lúc xuất viện.");
        dischargeConditionInput?.focus();
        return;
      }
      confirmBox.remove();
      const result = await patientService.dischargePatient(patientId, today, dischargeCondition);
      showToast(result.message);
      if (!result.success) {
        return;
      }
      // dischargePatient đã sync Patients từ cloud
      this.activeTab = 'discharged';
      await Promise.all([
        roomController.renderView(),
        Promise.resolve().then(() => this.renderView()),
      ]);

      const patientForDoc = {
        ...patientBefore,
        dischargeDate: today,
        dischargeCondition,
        status: "discharged",
      };
      this.promptDischargePaperDownload(patientForDoc);
    };
  }

  async downloadDischargePaperAction(patient) {
    if (patient) {
      try {
        const { downloadDischargePaperWord } = await import("../utils/dischargePaper.js");
        downloadDischargePaperWord(patient);
        showToast(`Đã tải file Giấy ra viện (.doc) cho bệnh nhân ${patient.name}.`);
      } catch (error) {
        console.error("Lỗi khi tải file giấy ra viện:", error);
        showToast("Không thể tải file Giấy ra viện.");
      }
    }
  }

  async downloadPrescriptionAction(patient) {
    if (patient) {
      try {
        const { downloadPrescriptionWord } = await import("../utils/prescriptionPrint.js");
        downloadPrescriptionWord(patient);
        showToast(`Đã tải file Đơn thuốc (.doc) cho bệnh nhân ${patient.name}.`);
      } catch (error) {
        console.error("Lỗi khi tải đơn thuốc:", error);
        showToast("Không thể tải đơn thuốc.");
      }
    }
  }

  // Helper đảm bảo medicine modal tồn tại trong DOM
  ensureMedicineModalExists() {
    if (document.getElementById('medicine-select-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'medicine-select-modal';
    modal.className = 'modal-overlay';
    modal.style = 'display:none;z-index:99999;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="medicine-modal-header">
          <i class="fa-solid fa-pills"></i>
          <h3>Chọn thuốc</h3>
        </div>
        <div class="medicine-modal-content">
          <div class="medicine-list-panel">
            <div class="medicine-list-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="medicine-list-search-input" placeholder="Tìm thuốc từ danh mục..." />
            </div>
            <div class="medicine-list-items"></div>
            <button type="button" class="add-new-medicine-btn">
              <i class="fa-solid fa-plus-circle"></i> Thêm thuốc mới vào danh mục
            </button>
          </div>
          <div class="medicine-selected-panel">
            <div class="medicine-selected-header">
              <span>Thuốc đã chọn</span>
              <span class="selected-count-badge" id="selected-meds-count">0</span>
            </div>
            <div class="medicine-selected-list"></div>
          </div>
        </div>
        
        <div class="medicine-add-form" style="display:none;">
          <div class="medicine-add-inputs">
            <input type="text" class="medicine-add-name medicine-add-input" placeholder="Tên thuốc (Ví dụ: Paracetamol, Amoxicillin...)" />
            <input type="text" class="medicine-add-dosage medicine-add-input" placeholder="Hàm lượng / Liều dùng (Ví dụ: 500mg, 10ml...)" />
            <button type="button" class="medicine-add-save-btn">Lưu thuốc</button>
            <button type="button" class="medicine-add-cancel-btn">Hủy bỏ</button>
          </div>
        </div>

        <div class="medicine-modal-footer">
          <button type="button" class="medicine-modal-cancel-btn">Huỷ</button>
          <button type="button" class="medicine-modal-ok-btn">Xác nhận</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Helper chọn thuốc cho đơn thuốc
  setupMedicineSelectionForPrescription(btnEl, textareaEl) {
    if (!btnEl || !textareaEl) return;
    btnEl.onclick = async () => {
      this.ensureMedicineModalExists();
      const { getAllMedicines, addMedicine } = await import('../services/medicineService.js');
      const allMedicines = await getAllMedicines();
      
      // Phân tích các thuốc hiện có từ textarea để làm trạng thái "đã chọn" ban đầu
      const currentText = textareaEl.value.trim();
      let selected = [];
      if (currentText) {
        // Tách các dòng thuốc bằng dòng mới hoặc dấu phẩy
        const lines = currentText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        selected = lines.map(line => {
          // Phân tách theo dấu gạch ngang (-) hoặc chấm phẩy (;) hoặc gạch đứng (|)
          const parts = line.split(/[-|;]/).map(p => p.trim());
          let nameAndDosage = parts[0] || "";
          let qty = parts[1] || "";
          let usage = parts[2] || "";
          
          let name = nameAndDosage;
          let dosage = "";
          const match = nameAndDosage.match(/^([^(]+)(?:\(([^)]+)\))?$/);
          if (match) {
            name = match[1].trim();
            dosage = match[2] ? match[2].trim() : "";
          }
          return {
            name,
            dosage,
            qty: qty || "14 Viên",
            usage: usage || "Uống theo chỉ dẫn của bác sĩ"
          };
        }).filter(m => m.name);
      }

      const modal = document.getElementById('medicine-select-modal');
      modal.style.display = "flex";
      modal.style.zIndex = "99999"; // Đảm bảo đè lên modal sửa đơn thuốc
      
      const listPanel = modal.querySelector('.medicine-list-items');
      const selectedPanel = modal.querySelector('.medicine-selected-list');
      const searchInput = modal.querySelector('.medicine-list-search-input');
      
      const renderLists = () => {
        const filter = searchInput.value || '';
        const filtered = allMedicines.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()));
        
        listPanel.innerHTML = filtered.map(med => {
          const isAlreadySelected = selected.some(s => s.name === med.name && s.dosage === med.dosage);
          const btnClass = isAlreadySelected ? "add-medicine-btn selected" : "add-medicine-btn";
          const btnText = isAlreadySelected ? "Đã chọn" : "+ Thêm";
          const btnDisabled = isAlreadySelected ? "disabled style='background:#d1fae5;color:#065f46;border-color:#bbf7d0;cursor:not-allowed;'" : "";
          
          return `<div class="medicine-list-item">
            <div class="medicine-item-info">
              <span class="medicine-item-name">${med.name}</span>
              ${med.dosage ? `<span class="medicine-item-dosage">${med.dosage}</span>` : ''}
            </div>
            <button type="button" class="${btnClass}" ${btnDisabled}>${btnText}</button>
          </div>`;
        }).join("");
        
        listPanel.querySelectorAll('.add-medicine-btn').forEach((addBtn, idx) => {
          if (addBtn.disabled) return;
          addBtn.onclick = () => {
            const med = filtered[idx];
            if (!selected.some(s => s.name === med.name && s.dosage === med.dosage)) {
              selected.push({
                name: med.name,
                dosage: med.dosage || "",
                qty: "14 Viên",
                usage: "Uống theo chỉ dẫn của bác sĩ"
              });
              renderLists();
            }
          };
        });
        
        const countBadge = modal.querySelector('#selected-meds-count');
        if (countBadge) {
          countBadge.textContent = selected.length;
        }

        if (selected.length === 0) {
          selectedPanel.innerHTML = `
            <div class="medicine-selected-empty">
              <i class="fa-solid fa-box-open"></i>
              <p>Chưa chọn thuốc nào.<br/>Hãy chọn từ danh sách bên trái.</p>
            </div>
          `;
          return;
        }

        selectedPanel.innerHTML = '';
        selected.forEach((med, idx) => {
          const row = document.createElement('div');
          row.className = 'medicine-selected-row';
          row.style = 'display:flex;flex-direction:column;gap:8px;align-items:stretch;';
          row.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
              <div class="medicine-item-info">
                <span class="medicine-item-name">${med.name}</span>
                ${med.dosage ? `<span class="medicine-item-dosage">${med.dosage}</span>` : ''}
              </div>
              <button type="button" class="remove-medicine-btn">&times;</button>
            </div>
            <div style="display:flex;gap:8px;margin-top:2px;width:100%;">
              <input type="text" class="med-qty-input" placeholder="SL (Ví dụ: 14 viên)" value="${med.qty || '14 Viên'}" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;font-size:0.82rem;min-width:0;" />
              <input type="text" class="med-usage-input" placeholder="Cách dùng (Ví dụ: Uống sau ăn)" value="${med.usage || 'Uống theo chỉ dẫn của bác sĩ'}" style="flex:2;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;font-size:0.82rem;min-width:0;" />
            </div>
          `;
          row.querySelector('.med-qty-input').oninput = (e) => {
            med.qty = e.target.value;
          };
          row.querySelector('.med-usage-input').oninput = (e) => {
            med.usage = e.target.value;
          };
          row.querySelector('.remove-medicine-btn').onclick = () => {
            selected.splice(idx, 1);
            renderLists();
          };
          selectedPanel.appendChild(row);
        });
      };
      
      searchInput.value = '';
      searchInput.oninput = renderLists;
      renderLists();
      
      modal.querySelector('.medicine-modal-ok-btn').onclick = () => {
        const formatted = selected.map(s => {
          const qty = s.qty || "14 Viên";
          const usage = s.usage || "Uống theo chỉ dẫn của bác sĩ";
          const nameWithDosage = s.name + (s.dosage ? ` (${s.dosage})` : "");
          return `${nameWithDosage} - ${qty} - ${usage}`;
        }).join("\n");
        textareaEl.value = formatted;
        modal.style.display = "none";
        textareaEl.dispatchEvent(new Event('change'));
      };
      
      modal.querySelector('.medicine-modal-cancel-btn').onclick = () => {
        modal.style.display = "none";
      };
      
      modal.querySelector('.add-new-medicine-btn').onclick = () => {
        modal.querySelector('.medicine-add-form').style.display = 'block';
      };
      
      modal.querySelector('.medicine-add-cancel-btn').onclick = () => {
        modal.querySelector('.medicine-add-form').style.display = 'none';
      };
      
      const addForm = modal.querySelector('.medicine-add-form');
      const addName = modal.querySelector('.medicine-add-name');
      const addDosage = modal.querySelector('.medicine-add-dosage');
      const addSaveBtn = modal.querySelector('.medicine-add-save-btn');
      
      addSaveBtn.onclick = async () => {
        const name = addName.value.trim();
        const dosage = addDosage.value.trim();
        if (!name) {
          alert('Vui lòng nhập tên thuốc!');
          addName.focus();
          return;
        }
        const res = await addMedicine({ name, dosage });
        if (res.success) {
          allMedicines.push({ name, dosage });
          selected.push({
            name,
            dosage,
            qty: "14 Viên",
            usage: "Uống theo chỉ dẫn của bác sĩ"
          });
          addName.value = '';
          addDosage.value = '';
          addForm.style.display = 'none';
          renderLists();
        } else {
          alert(res.message || 'Lỗi khi thêm thuốc!');
        }
      };
    };
  }

  // Phương thức hiển thị modal chỉnh sửa đơn thuốc cao cấp
  showPrescriptionEditModal(patient) {
    // Xoá modal chỉnh sửa đơn thuốc cũ nếu có
    const oldModal = document.getElementById("prescription-edit-modal");
    if (oldModal) oldModal.remove();

    const modalOverlay = document.createElement("div");
    modalOverlay.id = "prescription-edit-modal";
    modalOverlay.className = "modal-overlay show";
    modalOverlay.style.zIndex = "9998"; // Đứng dưới medicine select modal nhưng trên mọi thứ khác

    modalOverlay.innerHTML = `
      <div class="modal-card" style="max-width: 600px; width: 92vw; padding: 28px; position: relative;">
        <button id="prescription-edit-close" style="position: absolute; top: 18px; right: 18px; background: none; border: none; font-size: 1.7rem; line-height: 1; color: #888; cursor: pointer; z-index: 10;">&times;</button>
        <h3 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 8px; color: #0f172a;">Chỉnh sửa đơn thuốc</h3>
        
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 16px; font-size: 0.95rem; line-height: 1.5; color: #334155;">
          <div>Bệnh nhân: <b style="color: #0f172a;">${patient.name}</b></div>
          <div style="display: flex; gap: 16px; margin-top: 4px;">
            <span>Phòng: <b>${patient.room}</b></span>
            <span>Giường: <b>${(patient.bed || '').replace(/^giường\s+/i, '')}</b></span>
          </div>
          <div style="margin-top: 4px;">Chẩn đoán: <b>${patient.diagnosis || "Chưa nhập"}</b></div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label style="font-weight: 700; color: #1e293b; font-size: 0.98rem;">Nội dung đơn thuốc</label>
          <button type="button" id="edit-modal-select-medicine-btn" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 8px; font-size: 0.88rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Chọn từ danh mục
          </button>
        </div>

        <textarea id="modal-edit-prescription-text" rows="6" placeholder="Nhập tên thuốc, cách dùng. Ví dụ: Paracetamol (500mg) - Uống ngày 2 lần, mỗi lần 1 viên..." style="width: 100%; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 12px; font-size: 0.98rem; line-height: 1.5; resize: vertical; box-sizing: border-box; outline: none; margin-bottom: 20px; transition: border-color 0.15s; font-family: inherit;"></textarea>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="prescription-edit-cancel" style="padding: 10px 20px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 600; cursor: pointer; font-size: 0.95rem;">Huỷ</button>
          <button id="prescription-edit-save" style="padding: 10px 20px; border-radius: 8px; border: none; background: #2563eb; color: #fff; font-weight: 700; cursor: pointer; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);">
            Lưu &amp; Tải đơn thuốc
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    const textareaEl = modalOverlay.querySelector("#modal-edit-prescription-text");
    textareaEl.value = patient.prescription || "";
    textareaEl.focus();

    // Liên kết nút chọn thuốc từ danh mục
    const selectMedBtn = modalOverlay.querySelector("#edit-modal-select-medicine-btn");
    this.setupMedicineSelectionForPrescription(selectMedBtn, textareaEl);

    // Xử lý nút đóng và huỷ
    const closeBtn = modalOverlay.querySelector("#prescription-edit-close");
    const cancelBtn = modalOverlay.querySelector("#prescription-edit-cancel");
    const closeModal = () => modalOverlay.remove();
    
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    modalOverlay.onclick = (e) => {
      if (e.target === modalOverlay) closeModal();
    };

    // Xử lý nút Lưu & Tải
    const saveBtn = modalOverlay.querySelector("#prescription-edit-save");
    saveBtn.onclick = async () => {
      const newValue = textareaEl.value.trim();
      saveBtn.disabled = true;
      saveBtn.style.opacity = "0.7";
      saveBtn.textContent = "Đang xử lý...";

      try {
        const result = await patientService.updatePatient(patient.id, {
          ...patient,
          prescription: newValue
        });

        if (result.success) {
          showToast("Cập nhật đơn thuốc thành công!");
          
          // Tải đơn thuốc với dữ liệu mới
          this.downloadPrescriptionAction({
            ...patient,
            prescription: newValue
          });

          closeModal();

          // Render lại views
          await Promise.all([
            roomController.renderView(),
            Promise.resolve().then(() => this.renderView())
          ]);
        } else {
          showToast(result.message || "Lỗi khi lưu đơn thuốc.");
          saveBtn.disabled = false;
          saveBtn.style.opacity = "1";
          saveBtn.textContent = "Lưu & Tải đơn thuốc";
        }
      } catch (error) {
        console.error("Lỗi khi cập nhật đơn thuốc:", error);
        showToast("Lỗi hệ thống khi cập nhật đơn thuốc.");
        saveBtn.disabled = false;
        saveBtn.style.opacity = "1";
        saveBtn.textContent = "Lưu & Tải đơn thuốc";
      }
    };
  }
}

export default new PatientController();
