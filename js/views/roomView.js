// ============================================
// ROOM VIEW - Render UI phòng bệnh
// ============================================

import authService from "../services/authService.js";

/**
 * Render giao diện danh sách phòng bệnh và số giường
 * @param {HTMLElement} container
 * @param {Array} rooms
 * @param {Function} onRoomClick
 */
export function renderRoomListView(container, rooms, onRoomClick) {
  // ====== CẢI TIẾN: State quản lý lọc lầu/sắp xếp ======
  const floors = Array.from(new Set(rooms.map(r => String(r.name).trim()[0]))).sort();
  let selectedSort = window.selectedRoomSort || "number";
  let selectedFloors = window.selectedRoomFloors || floors;
  // State tạm cho modal
  let selectedFloorsTemp = [...selectedFloors];
  let selectedSortTemp = selectedSort;
  // Gom nhóm phòng theo lầu
  const floorMap = {};
  rooms.forEach(room => {
    const floor = String(room.name).trim()[0];
    if (!floorMap[floor]) floorMap[floor] = [];
    floorMap[floor].push(room);
  });
  // Sắp xếp các lầu
  const sortedFloors = Object.keys(floorMap).sort();
  // Sắp xếp phòng trong từng lầu
  sortedFloors.forEach(f => {
    if (selectedSort === "number") {
      floorMap[f] = floorMap[f].slice().sort((a, b) => parseInt(a.name) - parseInt(b.name));
    } else if (selectedSort === "empty") {
      floorMap[f] = floorMap[f].slice().sort((a, b) => b.beds.filter(bed => !bed.occupied).length - a.beds.filter(bed => !bed.occupied).length);
    } else if (selectedSort === "full") {
      floorMap[f] = floorMap[f].slice().sort((a, b) => {
        const fa = a.beds.filter(bed => !bed.occupied).length === 0 ? 0 : 1;
        const fb = b.beds.filter(bed => !bed.occupied).length === 0 ? 0 : 1;
        return fa - fb;
      });
    }
  });

  // Luôn kiểm tra quyền qua authService để đồng bộ trạng thái
  const isAdmin = authService && authService.can && authService.can("rooms.create");
  container.innerHTML = `
    <div class="section-head" style="display:flex;justify-content:flex-end;align-items:center;gap:10px;">
      <div style="display:flex;gap:10px;align-items:center;white-space:nowrap;">
        <button id="floor-filter-btn" class="ghost-btn" type="button" style="border:1.5px solid #dde8f3;color:#133150;background:#f7fbff;font-weight:600;display:inline-flex;align-items:center;gap:6px;border-radius:16px;padding:8px 22px;box-shadow:0 2px 8px #eaf4ff;transition:all 0.18s;font-size:1.08rem;line-height:1.2;"><img src="image/filter.png" alt="Lọc lầu" class="icon-img" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;"/><span style="font-size:1.08rem;font-weight:600;">Lọc lầu</span></button>
        ${isAdmin ? `<button id="add-room-btn" class="ghost-btn" type="button" style="font-weight:700;background:linear-gradient(120deg, var(--cyan), var(--blue));color:#fff;white-space:nowrap;min-width:140px;padding-left:18px;padding-right:18px;display:inline-flex;align-items:center;gap:8px;border-radius:16px;box-shadow:0 4px 16px #eaf4ff;transition:all 0.18s;"><img src="image/addroom.png" alt="Thêm phòng" class="icon-img" style="width:18px;height:18px;margin-right:8px;vertical-align:middle;"/><span>Thêm phòng</span></button>` : ""}
      </div>
    </div>
    <!-- ====== CẢI TIẾN: Modal lọc lầu hiện đại tham khảo từ 'mau' ====== -->
    <div id="floor-filter-modal" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.18);z-index:1000;align-items:center;justify-content:center;">
      <div style="background:#fff;padding:38px 38px 28px 38px;border-radius:28px;box-shadow:0 8px 40px #2563eb33;min-width:340px;max-width:96vw;display:flex;flex-direction:column;align-items:center;">
        <div style="width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:1.35rem;font-weight:800;letter-spacing:0.5px;color:#1e293b;display:flex;align-items:center;gap:10px;">
            <img src="image/building.png" style="width:28px;height:28px;" alt="icon" />
            Chọn lầu muốn hiển thị
          </div>
          <button id="floor-select-all" style="font-size:1rem;font-weight:600;color:#2563eb;background:none;border:none;cursor:pointer;">Chọn tất cả</button>
        </div>
        <div style="font-size:1.08rem;color:#64748b;margin-bottom:18px;width:100%;text-align:left;">Chọn các lầu bệnh viện cần hiển thị.</div>
        <div style="display:flex;gap:18px;margin-bottom:26px;justify-content:center;width:100%;">
          ${floors.map(f => {
            const selected = selectedFloors.includes(f);
            return `
            <button type="button" class="floor-toggle-btn" data-floor="${f}" style="
              flex:1 1 0;
              width:70px;height:80px;
              display:flex;flex-direction:column;align-items:center;justify-content:center;
              border-radius:20px;
              border:2.5px solid ${selected?'#2563eb':'#e5e7eb'};
              background:${selected?'linear-gradient(135deg,#2563eb 60%,#1e293b 100%)':'#fff'};
              color:${selected?'#fff':'#1e293b'};
              font-size:1.45rem;font-weight:800;
              box-shadow:${selected?'0 4px 18px 0 rgba(37,99,235,0.13)':'0 2px 8px #e5e7eb55'};
              transition:all 0.18s;
              outline:none;cursor:pointer;position:relative;
            "
            onmouseover="this.style.borderColor='#2563eb';this.style.boxShadow='0 4px 18px 0 rgba(37,99,235,0.18)';if(!${selected}){this.style.background='#f3f6fd';this.style.color='#2563eb';}"
            onmouseout="this.style.borderColor='${selected?'#2563eb':'#e5e7eb'}';this.style.boxShadow='${selected?'0 4px 18px 0 rgba(37,99,235,0.13)':'0 2px 8px #e5e7eb55'}';if(!${selected}){this.style.background='#fff';this.style.color='#1e293b';}"
            >
              <span style="font-size:2rem;font-weight:700;">${f}</span>
              <span style="font-size:1rem;font-weight:500;color:${selected?'#dbeafe':'#64748b'};">Lầu</span>
            </button>
            `;
          }).join('')}
        </div>
        <hr style="width:100%;border:none;border-top:1.5px solid #e5e7eb;margin:18px 0 18px 0;" />
        <div style="width:100%;margin-bottom:18px;">
          <div style="font-size:1.13rem;font-weight:700;margin-bottom:10px;color:#1e293b;">Sắp xếp phòng theo</div>
          <div style="display:flex;gap:32px;justify-content:center;">
            <label style="display:flex;align-items:center;gap:10px;font-size:1.12rem;font-weight:500;cursor:pointer;">
              <input type="radio" name="room-sort-radio" value="number" ${selectedSort==="number"?"checked":''} style="width:20px;height:20px;accent-color:#2563eb;">
              <span style="display:flex;align-items:center;gap:6px;"><img src="image/hashtag.png" style="width:18px;height:18px;opacity:0.7;"/>Số phòng</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;font-size:1.12rem;font-weight:500;cursor:pointer;">
              <input type="radio" name="room-sort-radio" value="empty" ${selectedSort==="empty"?"checked":''} style="width:20px;height:20px;accent-color:#2563eb;">
              <span style="display:flex;align-items:center;gap:6px;"><img src="image/bed.png" style="width:18px;height:18px;opacity:0.7;"/>Giường trống nhiều nhất</span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;font-size:1.12rem;font-weight:500;cursor:pointer;">
              <input type="radio" name="room-sort-radio" value="full" ${selectedSort==="full"?"checked":''} style="width:20px;height:20px;accent-color:#2563eb;">
              <span style="display:flex;align-items:center;gap:6px;"><img src="image/warning.png" style="width:18px;height:18px;opacity:0.7;"/>Phòng đầy</span>
            </label>
          </div>
        </div>
        <div style="display:flex;gap:16px;justify-content:flex-end;width:100%;margin-top:8px;">
          <button id="floor-filter-cancel" style="padding:10px 26px;border-radius:10px;border:none;background:#e2e8f0;color:#64748b;font-weight:700;font-size:1.08rem;">Hủy</button>
          <button id="floor-filter-clear" style="padding:10px 26px;border-radius:10px;border:none;background:#fff;color:#ef4444;font-weight:700;font-size:1.08rem;border:1.5px solid #ef4444;">Bỏ lọc</button>
          <button id="floor-filter-apply" style="padding:10px 26px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-weight:800;font-size:1.08rem;box-shadow:0 2px 8px #2563eb33;transition:background 0.2s;">Áp dụng</button>
        </div>
      </div>
    </div>
      ${sortedFloors
        .filter(f => selectedFloors.includes(f))
        .map(f => `
          <div style="margin-top:32px;margin-bottom:10px;">
            <h3 style="margin-bottom:18px;margin-top:0;font-size:1.35rem;font-weight:800;letter-spacing:0.5px;">Lầu ${f}</h3>
            <div class="room-grid-4">
              ${floorMap[f].map(room => {
                const totalBeds = room.beds.length;
                const usedBeds = room.beds.filter(b => b.occupied).length;
                const emptyBeds = totalBeds - usedBeds;
                
                // Color mapping based on status
                const accentColor = emptyBeds === 0 ? '#ef4444' : (emptyBeds === 1 ? '#f59e0b' : '#10b981');
                const percent = Math.round((usedBeds / totalBeds) * 100);

                let badge = `
                  <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; white-space: nowrap;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
                    ${emptyBeds} Trống
                  </span>`;
                if (emptyBeds === 0) {
                  badge = `
                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; background: #fff5f5; color: #ef4444; border: 1px solid #fecaca; white-space: nowrap;">
                      <span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
                      Đầy
                    </span>`;
                } else if (emptyBeds === 1) {
                  badge = `
                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; background: #fffbeb; color: #d97706; border: 1px solid #fef3c7; white-space: nowrap;">
                      <span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; display: inline-block;"></span>
                      1 Trống
                    </span>`;
                }
                // Generate micro beds view
                const bedsHtml = (room.beds || []).map((bed, bIdx) => {
                  const isOccupied = bed.occupied;
                  const tooltipText = isOccupied ? `Giường ${bIdx + 1}: ${bed.patientName || 'Đã có bệnh nhân'}` : `Giường ${bIdx + 1}: Trống`;
                  return `
                    <div title="${tooltipText}" style="
                      width: 42px;
                      height: 42px;
                      border-radius: 10px;
                      background: ${isOccupied ? '#fff5f5' : '#f0fdf4'};
                      border: 2px solid ${isOccupied ? '#fecaca' : '#bbf7d0'};
                      display: inline-flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      cursor: pointer;
                      position: relative;
                      box-shadow: 0 2px 6px rgba(0,0,0,0.01);
                      transition: all 0.2s ease;
                    "
                    onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)';"
                    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.01)';"
                    >
                      <img src="image/bedd.png" style="width: 22px; height: 22px; object-fit: contain; margin-bottom: 2px; ${isOccupied ? '' : 'filter: grayscale(1) opacity(0.6);'}" />
                      <span style="font-size: 0.65rem; font-weight: 800; color: ${isOccupied ? '#ef4444' : '#16a34a'}; opacity: 0.85;">${bIdx + 1}</span>
                    </div>
                  `;
                }).join('');

                return `
                <div class="card room-card" data-room-id="${room.id}" style="
                  min-width: 280px;
                  max-width: 320px;
                  position: relative;
                  padding: 22px 20px 18px 20px;
                  border-radius: 18px;
                  border: 1px solid #e2e8f0;
                  border-top: 5px solid ${accentColor};
                  background: #fff;
                  display: flex;
                  flex-direction: column;
                  gap: 16px;
                  box-shadow: 0 4px 18px rgba(0,0,0,0.035);
                  transition: all 0.22s ease-in-out;
                  cursor: pointer;
                "
                onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 10px 25px rgba(37,99,235,0.09)'; this.style.borderColor='${accentColor}';"
                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 18px rgba(0,0,0,0.035)'; this.style.borderColor='#e2e8f0';"
                >
                  <!-- Header Row -->
                  <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="background: #f1f5fd; border-radius: 10px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"></path>
                          <path d="M2 20h20"></path>
                          <path d="M14 12v.01" stroke-width="3"></path>
                        </svg>
                      </div>
                      <div style="font-size: 1.25rem; font-weight: 800; color: #0f172a; letter-spacing: -0.2px;">Phòng ${room.name}</div>
                    </div>
                    ${badge}
                  </div>

                  <div style="width: 100%;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.88rem; color: #64748b; font-weight: 600; margin-bottom: 6px;">
                      <span>Sử dụng giường:</span>
                      <!-- GỐC: <span style="color: #0f172a; font-weight: 700;">${usedBeds}/${totalBeds} (${percent}%)</span> -->
                      <span style="color: #0f172a; font-weight: 700;">${usedBeds}/${totalBeds}</span>
                    </div>
                    <div style="width: 100%; height: 7px; background: #f1f5f9; border-radius: 4px; overflow: hidden; border: 1px solid #f1f5f9;">
                      <div style="width: ${percent}%; height: 100%; background: ${accentColor}; border-radius: 4px; transition: width 0.3s ease;"></div>
                    </div>
                  </div>

                  <!-- Micro Bed Map -->
                  <div style="border-top: 1px dashed #e2e8f0; padding-top: 12px; width: 100%;">
                 
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                      ${bedsHtml}
                    </div>
                  </div>
                </div>
                `;
              }).join("")}
            </div>
          </div>
        `).join("")}
  `;
  // Sự kiện click phòng
  container.querySelectorAll('.room-card').forEach(card => {
    card.onclick = () => {
      const roomId = card.getAttribute('data-room-id');
      onRoomClick(roomId);
    };
  });
  // Sự kiện thêm phòng (chỉ gán nếu tồn tại nút)
  const addRoomBtn = container.querySelector('#add-room-btn');
  if (addRoomBtn) {
    addRoomBtn.onclick = () => {
      document.dispatchEvent(new CustomEvent('addRoomClick'));
    };
  }
  // ====== CẢI TIẾN: Sự kiện modal lọc lầu hiện đại ======
  const floorFilterBtn = container.querySelector('#floor-filter-btn');
  const floorFilterModal = container.querySelector('#floor-filter-modal');
  if (floorFilterBtn && floorFilterModal) {
    floorFilterBtn.onclick = () => {
      // Reset state tạm mỗi lần mở modal
      selectedFloorsTemp = [...selectedFloors];
      selectedSortTemp = selectedSort;
      // Render lại giao diện các nút
      floorFilterModal.querySelectorAll('.floor-toggle-btn').forEach(btn2 => {
        const ff = btn2.getAttribute('data-floor');
        if (selectedFloorsTemp.includes(ff)) {
          btn2.style.background = '#2563eb';
          btn2.style.color = '#fff';
          btn2.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
        } else {
          btn2.style.background = '#fff';
          btn2.style.color = '#2563eb';
          btn2.style.boxShadow = 'none';
        }
      });
      // Render lại radio
      floorFilterModal.querySelectorAll('input[name="room-sort-radio"]').forEach(radio => {
        radio.checked = radio.value === selectedSortTemp;
      });
      floorFilterModal.style.display = 'flex';
    };
    floorFilterModal.onclick = (e) => {
      if (e.target === floorFilterModal) floorFilterModal.style.display = 'none';
    };
    // Toggle chọn lầu bằng button
    floorFilterModal.querySelectorAll('.floor-toggle-btn').forEach(btn => {
      btn.onclick = () => {
        const f = btn.getAttribute('data-floor');
        if (selectedFloorsTemp.includes(f)) {
          selectedFloorsTemp = selectedFloorsTemp.filter(x => x !== f);
        } else {
          selectedFloorsTemp.push(f);
        }
        // Nếu không chọn lầu nào thì không highlight nút nào
        floorFilterModal.querySelectorAll('.floor-toggle-btn').forEach(btn2 => {
          const ff = btn2.getAttribute('data-floor');
          if (selectedFloorsTemp.includes(ff)) {
            btn2.style.background = '#2563eb';
            btn2.style.color = '#fff';
            btn2.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
          } else {
            btn2.style.background = '#fff';
            btn2.style.color = '#2563eb';
            btn2.style.boxShadow = 'none';
          }
        });
      };
    });
    // Chọn tất cả
    const selectAllBtn = floorFilterModal.querySelector('#floor-select-all');
    if (selectAllBtn) {
      selectAllBtn.onclick = () => {
        selectedFloorsTemp = [...floors];
        floorFilterModal.querySelectorAll('.floor-toggle-btn').forEach(btn2 => {
          btn2.style.background = '#2563eb';
          btn2.style.color = '#fff';
          btn2.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
        });
      };
    }
    // Radio group sort
    floorFilterModal.querySelectorAll('input[name="room-sort-radio"]').forEach(radio => {
      radio.onchange = (e) => {
        selectedSortTemp = e.target.value;
      };
    });
    // Hủy
    floorFilterModal.querySelector('#floor-filter-cancel').onclick = () => {
      floorFilterModal.style.display = 'none';
    };
    // Áp dụng
    floorFilterModal.querySelector('#floor-filter-apply').onclick = () => {
      window.selectedRoomFloors = selectedFloorsTemp.length ? selectedFloorsTemp : [...floors];
      window.selectedRoomSort = selectedSortTemp;
      floorFilterModal.style.display = 'none';
      renderRoomListView(container, rooms, onRoomClick);
    };
    // Bỏ lọc
    floorFilterModal.querySelector('#floor-filter-clear').onclick = () => {
      selectedFloorsTemp = [...floors];
      window.selectedRoomFloors = [...floors];
      selectedSortTemp = 'number';
      window.selectedRoomSort = 'number';
      floorFilterModal.style.display = 'none';
      renderRoomListView(container, rooms, onRoomClick);
    };
  }
  // Sự kiện sort (chỉ gán nếu có select ngoài popup, hiện tại đã chuyển vào popup nên đoạn này có thể bỏ hoặc kiểm tra tồn tại)
  const sortSelect = container.querySelector('#room-sort-filter');
  if (sortSelect) {
    sortSelect.onchange = (e) => {
      window.selectedRoomSort = e.target.value;
      renderRoomListView(container, rooms, onRoomClick);
    };
  }
}

/**
 * Render giao diện chi tiết phòng và các giường
 * @param {HTMLElement} container
 * @param {Object} room
 * @param {Function} onAddBed
 * @param {Function} onRemoveBed
 */
export function renderRoomDetailView(container, room, onAddBed, onRemoveBed) {
  const usedBeds = room.beds.filter((bed) => bed.occupied).length;

  container.innerHTML = `
    <div class="bed-detail-page">
      <div class="bed-detail-hero card">
        <div class="bed-detail-hero-left">
          <button id="back-to-room-list" class="ghost-btn bed-back-btn" type="button"><i class="fa-solid fa-arrow-left"></i> Quay lại</button>
          <div>
            <div class="bed-detail-kicker">Chi tiết giường bệnh</div>
            <h2 class="bed-detail-title">Phòng ${room.name}</h2>
            <div class="bed-detail-subtitle">Theo dõi trạng thái từng giường, bệnh nhân và vị trí robot.</div>
          </div>
        </div>
        <div class="bed-detail-summary">
          <div class="bed-summary-value">${usedBeds}</div>
          <div>
            <div class="bed-summary-label">giường đang sử dụng</div>
            <div class="bed-summary-total">Tổng ${room.beds.length} giường</div>
          </div>
        </div>
      </div>

      <div class="bed-grid">
        ${room.beds.map((bed, idx) => {
          const dotColor = bed.occupied ? '#2563eb' : '#10b981';
          const cardClass = bed.occupied ? 'bed-card bed-card--occupied' : 'bed-card bed-card--empty';
          const icon = `<img src="image/bedd.png" alt="Bed" style="width:38px;height:38px;object-fit:contain;filter:${bed.occupied ? '' : 'grayscale(0.5) opacity(0.7)'};">`;
          const status = bed.occupied ? `<span class='bed-status-text bed-status-used'>Đang sử dụng</span>` : `<span class='bed-status-text bed-status-empty'>Trống</span>`;
          const patient = bed.occupied ? `<span class='bed-patient-inline'>${bed.patientName || ''}</span>` : '<span class="bed-patient-empty">Chưa có bệnh nhân</span>';
          const pos = bed.position || { x: '', y: '', theta: '' };
          return `
            <div class="card ${cardClass}" data-bed-idx="${idx}" tabindex="0" role="button" aria-controls="bed-detail-modal">
              <div class="bed-card-head">
                <span class="bed-status-dot" style="background:${dotColor};"></span>
                <div class="bed-icon-wrap">${icon}</div>
                <div class="bed-card-body">
                  <div class="bed-card-title">Giường ${idx + 1}</div>
                  <div class="bed-card-status">${status}</div>
                  <div class="bed-card-patient">${patient}</div>
                </div>
              </div>
              <div class="bed-card-meta">
                <div class="bed-position-text"><b>Vị trí:</b> x: ${pos.x || '-'}, y: ${pos.y || '-'}, θ: ${pos.theta || '-'}</div>
                ${window.authService && window.authService.can && window.authService.can('rooms.edit_position') ? `<button class="edit-bed-pos-btn bed-action-btn" data-bed-idx="${idx}" type="button">Sửa vị trí</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div id="bed-detail-modal" style="display:none;"></div>
    </div>
  `;

  container.querySelectorAll('.edit-bed-pos-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const authService = window.authService;
      if (!authService || !authService.can || !authService.can('rooms.edit_position')) {
        alert('Chỉ admin mới được sửa vị trí giường.');
        return;
      }

      const idx = parseInt(btn.getAttribute('data-bed-idx'));
      const bed = room.beds[idx];
      const pos = bed.position || { x: '', y: '', theta: '' };
      const modal = container.querySelector('#bed-detail-modal');

      modal.innerHTML = `
        <div class="bed-modal-overlay">
          <form id="edit-bed-pos-form" class="bed-modal-card">
            <button id="close-edit-bed-pos" type="button" class="bed-modal-close">&times;</button>
            <h3>Cập nhật vị trí giường ${idx + 1}</h3>
            <div class="bed-pos-grid">
              <div><label>x</label><input name="x" type="number" step="any" value="${pos.x}"></div>
              <div><label>y</label><input name="y" type="number" step="any" value="${pos.y}"></div>
              <div><label>θ</label><input name="theta" type="number" step="any" value="${pos.theta}"></div>
            </div>
            <button type="submit" class="bed-save-btn">Lưu vị trí</button>
          </form>
        </div>
      `;

      modal.style.display = 'block';
      modal.querySelector('#close-edit-bed-pos').onclick = () => {
        modal.style.display = 'none';
        modal.innerHTML = '';
      };
      modal.querySelector('#edit-bed-pos-form').onsubmit = async (ev) => {
        ev.preventDefault();
        const x = parseFloat(ev.target.x.value);
        const y = parseFloat(ev.target.y.value);
        const theta = parseFloat(ev.target.theta.value);
        modal.innerHTML = '<div class="bed-modal-loading">Đang lưu...</div>';
        try {
          await window.roomService.updateBedPosition(room.id, idx, { x, y, theta });
          modal.innerHTML = '<div class="bed-modal-success">Đã lưu vị trí!</div>';
          setTimeout(() => {
            modal.style.display = 'none';
            modal.innerHTML = '';
            if (window.roomController) {
              window.roomController.renderView();
            } else {
              window.location.reload();
            }
          }, 900);
        } catch (err) {
          modal.innerHTML = '<div class="bed-modal-error">Lỗi khi lưu vị trí!</div>';
        }
      };
    };
  });

  container.querySelectorAll('.bed-card').forEach((card) => {
    // make keyboard accessible
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    };

    card.onclick = () => {
      const idx = parseInt(card.getAttribute('data-bed-idx'));
      const bed = room.beds[idx];
      const dotColor = bed.occupied ? '#2563eb' : '#10b981';
      const icon = `<img src="image/bedd.png" alt="Bed" style="width:38px;height:38px;object-fit:contain;filter:${bed.occupied ? '' : 'grayscale(0.5) opacity(0.7)'};">`;

      if (!bed.occupied) {
        const modal = container.querySelector('#bed-detail-modal');
        modal.innerHTML = `
          <div class="bed-modal-overlay">
            <div class="bed-modal-card bed-empty-modal">
              <button id="close-bed-detail" class="bed-modal-close">&times;</button>
              <div class="bed-modal-head">
                <span class="bed-icon-wrap">${icon}</span>
                <div>
                  <div class="bed-modal-title">Giường ${idx + 1}</div>
                  <div class="bed-modal-status bed-status-empty"><span style="background:${dotColor};"></span> Trống</div>
                </div>
              </div>
              <div class="bed-empty-state">
                <span class="bed-empty-badge"><img src="image/bedd.png" style="width:38px;height:38px;filter:grayscale(0.5) opacity(0.7);" /></span>
                <div class="bed-empty-text">Giường này hiện đang trống</div>
              </div>
            </div>
          </div>
        `;
        modal.style.display = 'block';
        modal.querySelector('#close-bed-detail').onclick = () => {
          modal.style.display = 'none';
          modal.innerHTML = '';
        };
        return;
      }

      let status = `<span style='color:#2563eb;font-weight:700;'>Đang sử dụng</span>`;
      let age = '—';
      let admissionDate = '—';
      let doctor = '—';
      if (bed.patientName) {
        const patients = window.stateService ? window.stateService.getState().patients : [];
        const p = patients.find((pt) => pt.name === bed.patientName && pt.room === room.name && pt.bed === bed.name);
        if (p) {
          if (p.dob) {
            const dob = new Date(p.dob);
            const now = new Date();
            let years = now.getFullYear() - dob.getFullYear();
            const m = now.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years--;
            age = years + ' tuổi';
          }
          if (p.admissionDate) admissionDate = p.admissionDate;
          if (p.doctor) doctor = p.doctor;
        }
      }

      const modal = container.querySelector('#bed-detail-modal');
      modal.innerHTML = `
        <div class="bed-modal-overlay">
          <div class="bed-modal-card bed-occupied-modal">
            <button id="close-bed-detail" class="bed-modal-close">&times;</button>
            <div class="bed-modal-head">
              <span class="bed-icon-wrap">${icon}</span>
              <div>
                <div class="bed-modal-title">Giường ${idx + 1}</div>
                <div class="bed-modal-status bed-status-used"><span style="background:${dotColor};"></span> ${status}</div>
              </div>
            </div>
            <div class="bed-patient-name">Tên bệnh nhân</div>
            <div class="bed-patient-value">${bed.patientName || '(Không có tên)'}</div>
            <div class="bed-info-grid">
              <div class="bed-info-item">
                <span>Tuổi</span>
                <strong>${age}</strong>
              </div>
              <div class="bed-info-item">
                <span>Ngày nhập viện</span>
                <strong><i class='fa-regular fa-calendar' style='margin-right:6px;'></i>${admissionDate}</strong>
              </div>
            </div>
            <div class="bed-doctor-label"><i class='fa-regular fa-user' style='margin-right:6px;'></i>Bác sĩ phụ trách</div>
            <div class="bed-doctor-value">${doctor}</div>
          </div>
        </div>
      `;
      modal.style.display = 'block';
      modal.querySelector('#close-bed-detail').onclick = () => {
        modal.style.display = 'none';
        modal.innerHTML = '';
      };
    };
  });

  container.querySelector('#back-to-room-list').onclick = () => {
    document.dispatchEvent(new CustomEvent('backToRoomList'));
  };
}
