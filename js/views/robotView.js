// ============================================
// ROBOT VIEW - Render UI robot
// ============================================

// Hàm kiểm tra và alert pin yếu toàn cục
function globalBatteryLowAlert(battery) {
  if (battery !== undefined && battery < 20) {
    if (!window.__batteryLowAlertShown) {
      window.__batteryLowAlertShown = true;
      setTimeout(() => { window.__batteryLowAlertShown = false; }, 10000); // Chỉ alert lại sau 10s
      window.alert('⚠️ Pin robot yếu! Vui lòng sạc robot.');
    }
  }
}

export function renderRobotView(container, robots, stats, selectedRobotId = null) {
  // Thêm hiệu ứng nhấp nháy cho pin yếu nếu chưa có
  if (!document.getElementById('blink-battery-style')) {
    const style = document.createElement('style');
    style.id = 'blink-battery-style';
    style.innerHTML = `
      @keyframes blink-battery {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
  }
  // Lấy robot chính và đội
  const mainRobot = robots[0] || {};
  const teamRobots = robots.slice(1);

  // Gọi alert pin yếu toàn cục (dù ở trang nào)
  globalBatteryLowAlert(mainRobot.battery);

  // SVG icon robot
  const robotSVG = `<svg width="240" height="200" viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="50" width="180" height="120" rx="40" stroke="#222" stroke-width="8" fill="#fff"/><rect x="10" y="90" width="40" height="60" rx="16" stroke="#222" stroke-width="8" fill="#fff"/><rect x="190" y="90" width="40" height="60" rx="16" stroke="#222" stroke-width="8" fill="#fff"/><circle cx="120" cy="40" r="20" stroke="#222" stroke-width="8" fill="#fff"/><circle cx="90" cy="110" r="10" fill="#222"/><circle cx="150" cy="110" r="10" fill="#222"/><path d="M100 140 Q120 160 140 140" stroke="#222" stroke-width="7" fill="none"/></svg>`;

  // Block robot chính
  const mainBlock = `
    <div style="display:flex;gap:48px;align-items:flex-start;">
      <div style="flex-shrink:0;">${robotSVG}</div>
      <div style="flex:1;max-width:600px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:15px;font-weight:700;text-transform:uppercase;color:#1a2b4c;opacity:0.7;">Đang online</div>
          <div style="font-size:16px;color:#1a2b4c;opacity:0.7;">Mã thiết bị <b style="color:#1a2b4c;">#UNIT-001</b></div>
        </div>
        <div style="font-size:48px;font-weight:800;color:#1a2b4c;margin:8px 0 18px 0;letter-spacing:-1px;">${mainRobot.name || ''}</div>
        <div style="display:flex;gap:18px;margin-bottom:18px;">
          <div style="flex:1;background:#fff;border-radius:18px;padding:18px 24px;box-shadow:0 2px 12px #0001;display:flex;flex-direction:column;align-items:flex-start;">
            <div style="font-size:13px;font-weight:700;letter-spacing:1px;opacity:0.7;display:flex;align-items:center;gap:6px;"><span style="font-size:18px;">&#128267;</span> DUNG LƯỢNG PIN</div>
            <div id="battery-value" style="font-size:32px;font-weight:800;${mainRobot.battery < 20 ? 'color:#ef4444;animation:blink-battery 1s infinite;' : 'color:#1a2b4c;'}">${mainRobot.battery || '--'}%</div>
            ${mainRobot.battery < 20 ? '<div id="battery-warning" style="color:#ef4444;font-weight:700;font-size:15px;margin-top:8px;animation:blink-battery 1s infinite;">⚠️ Pin yếu! Vui lòng sạc robot.</div>' : ''

            }
          </div>
          <div style="flex:1;background:#fff;border-radius:18px;padding:18px 24px;box-shadow:0 2px 12px #0001;display:flex;flex-direction:column;align-items:flex-start;">
            <div style="font-size:13px;font-weight:700;letter-spacing:1px;opacity:0.7;display:flex;align-items:center;gap:6px;"><span style="font-size:18px;">&#128205;</span> VỊ TRÍ</div>
            <div style="font-size:32px;font-weight:800;color:#1a2b4c;">${mainRobot.floor || '--'}</div>
          </div>
        </div>
        <div style="background:#f7faff;border-radius:18px;padding:18px 24px;box-shadow:0 2px 12px #0001;margin-bottom:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:18px;font-weight:700;">Nhiệm vụ hiện tại</div>
            <div style="font-size:15px;font-weight:700;color:#2563eb;">65% Hoàn tất</div>
          </div>
          <div style="display:flex;align-items:center;gap:14px;margin-top:10px;">
            <div style="background:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 2px 8px #0001;display:flex;align-items:center;justify-content:center;">
              <span style="font-size:22px;">&#128138;</span>
            </div>
            <div>
              <div style="font-size:22px;font-weight:700;">${mainRobot.task || 'Không có nhiệm vụ'}</div>
              <div style="font-size:15px;opacity:0.7;">Đến: ${mainRobot.location || '---'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  // Block biểu đồ Motor Speed dạng cột SVG
  const motorSpeedChart = `
    <div style="width:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div style="font-size:19px;font-weight:700;color:#3a4a5d;margin-bottom:8px;">Tốc độ động cơ</div>
      <svg width="80" height="48" viewBox="0 0 80 48">
        <rect x="4" y="32" width="12" height="12" rx="6" fill="${(mainRobot.speed||0)>=1?'#3498fd':'#e5eaf2'}"/>
        <rect x="20" y="24" width="12" height="20" rx="6" fill="${(mainRobot.speed||0)>=25?'#3498fd':'#e5eaf2'}"/>
        <rect x="36" y="16" width="12" height="28" rx="6" fill="${(mainRobot.speed||0)>=50?'#3498fd':'#e5eaf2'}"/>
        <rect x="52" y="8" width="12" height="36" rx="6" fill="${(mainRobot.speed||0)>=75?'#3498fd':'#e5eaf2'}"/>
        <rect x="68" y="0" width="12" height="44" rx="6" fill="${(mainRobot.speed||0)>=100?'#3498fd':'#e5eaf2'}"/>
      </svg>
    </div>
  `;

  // Block tốc độ (cho phép điều chỉnh) kèm biểu đồ bên trái
  const performanceBlock = `
    <div style="background:#fff;border-radius:18px;padding:24px 32px;box-shadow:0 2px 12px #0001;flex:1;display:flex;align-items:center;gap:32px;min-height:120px;">
      ${motorSpeedChart}
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:700;margin-bottom:18px;display:flex;align-items:center;gap:8px;">&#128337; Tốc độ di chuyển</div>
        <div style="display:flex;align-items:center;gap:18px;">
          <input id="robot-speed-input" type="range" min="0" max="100" step="1" value="${mainRobot.speed || 50}" data-robot-id="${mainRobot.id || ''}" style="flex:1;accent-color:#2563eb;" />
          <span style="font-size:28px;font-weight:700;color:#2563eb;min-width:60px;text-align:right;">${mainRobot.speed || 50} m/s</span>
        </div>
      </div>
    </div>`;

  // Block chỉ số hệ thống đã bị xóa
  const systemBlock = '';

  // Block danh sách robot phụ (ngoài robot chính)
  const teamStatus = teamRobots.length ? `
    <div style="background:#fff;border-radius:24px;padding:28px 24px;box-shadow:0 4px 24px #2563eb11;margin-top:32px;">
      <div style="font-size:22px;font-weight:800;color:#1a2b4c;margin-bottom:18px;">Danh sách robot</div>
      <div style="display:flex;flex-direction:column;gap:18px;">
        ${teamRobots.map(r => `
          <div class="robot-list-item" data-robot-id="${r.id}" style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid #f0f4fa;cursor:pointer;transition:background 0.15s;">
            <div style="width:48px;height:48px;border-radius:12px;overflow:hidden;background:#f7faff;display:flex;align-items:center;justify-content:center;">
              ${r.avatar ? `<img src="${r.avatar}" alt="avatar" style="width:100%;height:100%;object-fit:cover;" />` : `<span style="font-size:28px;">🤖</span>`}
            </div>
            <div style="flex:1;">
              <div style="font-size:18px;font-weight:700;color:#1a2b4c;">${r.name}</div>
              <div style="font-size:14px;opacity:0.7;">${r.task || 'Không có nhiệm vụ'}</div>
            </div>
            <div style="font-size:14px;font-weight:700;color:${r.online ? '#10b981' : '#e11d48'};min-width:60px;text-align:right;">${r.online ? 'Online' : 'Offline'}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Nút thêm robot mới (button để bắt sự kiện click)
  const addRobotBtn = `
    <button id="show-add-robot-modal" style="background:#fff;border-radius:24px;padding:36px 0 36px 0;box-shadow:0 4px 24px #2563eb11;text-align:center;margin-bottom:32px;width:100%;border:none;cursor:pointer;outline:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">
      <span style="font-size:38px;color:#2563eb;font-weight:700;">+</span>
      <span style="font-size:36px;font-weight:800;color:#1a2b4c;margin:8px 0 0 0;letter-spacing:-1px;">Thêm robot mới</span>
      <span style="font-size:20px;color:#7b8ca6;margin-top:4px;font-weight:500;">Mở rộng hạm đội của bạn</span>
    </button>`;

  // Layout tổng
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:2.2fr 1.1fr;gap:48px;align-items:start;padding:32px 0 0 0;max-width:1400px;margin:0 auto;">
      <div>
        ${mainBlock}
        <div style="display:flex;gap:32px;margin-top:38px;">
          ${performanceBlock}
          ${systemBlock}
        </div>
      </div>
      <div>
        ${addRobotBtn}
        ${teamStatus}
      </div>
    </div>
  `;
}
