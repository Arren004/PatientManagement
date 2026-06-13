// ============================================
// ROBOT VIEW - Render UI robot (dùng .robot-dashboard trong styles.css)
// ============================================

import {
  ROBOT_VELOCITY_V_BOUNDS,
  ROBOT_VELOCITY_W_BOUNDS,
} from "../data/constants.js";

/*
function ensureBlinkBatteryStyle() {
  if (document.getElementById("blink-battery-style")) return;
  const style = document.createElement("style");
  style.id = "blink-battery-style";
  style.textContent = `
    @keyframes blink-battery {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }
  `;
  document.head.appendChild(style);
}
*/

function ensureBlinkBatteryStyle() {
  if (document.getElementById("blink-battery-style")) return;
  const style = document.createElement("style");
  style.id = "blink-battery-style";
  style.textContent = `
    @keyframes blink-battery {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }
    @keyframes pulse-proximity {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(0.97); }
    }
  `;
  document.head.appendChild(style);
}

function globalBatteryLowAlert(battery) {
  if (battery !== undefined && battery < 20) {
    if (!window.__batteryLowAlertShown) {
      window.__batteryLowAlertShown = true;
      setTimeout(() => {
        window.__batteryLowAlertShown = false;
      }, 10000);
      window.alert("Pin robot yếu. Vui lòng sạc robot.");
    }
  }
}

function parseMissionPercent(text) {
  const m = String(text || "").match(/(\d+)/);
  return m ? Math.min(100, parseInt(m[1], 10)) : 0;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Chuẩn hóa để tìm kiếm (không phân biệt hoa thường, bỏ dấu tiếng Việt). */
function normalizeForSearch(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chỉ giữ chữ số a–z và 0–9 — để khớp ví dụ Number.2 với "number2". */
function compactAsciiAlnum(s) {
  return normalizeForSearch(s).replace(/[^a-z0-9]/g, "");
}

const robotSVG = `<svg class="robot-svg-fallback" width="200" height="168" viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="30" y="50" width="180" height="120" rx="40" stroke="currentColor" stroke-width="8" fill="#fff"/><rect x="10" y="90" width="40" height="60" rx="16" stroke="currentColor" stroke-width="8" fill="#fff"/><rect x="190" y="90" width="40" height="60" rx="16" stroke="currentColor" stroke-width="8" fill="#fff"/><circle cx="120" cy="40" r="20" stroke="currentColor" stroke-width="8" fill="#fff"/><circle cx="90" cy="110" r="10" fill="currentColor"/><circle cx="150" cy="110" r="10" fill="currentColor"/><path d="M100 140 Q120 160 140 140" stroke="currentColor" stroke-width="7" fill="none"/></svg>`;

function parseRobotVelocities(robot) {
  if (robot && (robot.v != null || robot.w != null)) {
    const fv = robot.v != null ? Number(robot.v) : 0;
    const fw = robot.w != null ? Number(robot.w) : 0;
    return {
      v: Number.isNaN(fv) ? 0.5 : fv,
      w: Number.isNaN(fw) ? 0 : fw,
    };
  }
  if (robot && robot.speed != null) {
    const s = Number(robot.speed);
    if (!Number.isNaN(s)) {
      return { v: (s / 100) * 2, w: (s / 100) * 4 };
    }
  }
  return { v: 0.5, w: 1.0 };
}

function clampRobotV(n) {
  const { min, max } = ROBOT_VELOCITY_V_BOUNDS;
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function clampRobotW(n) {
  const { min, max } = ROBOT_VELOCITY_W_BOUNDS;
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return Math.min(max, Math.max(min, x));
}

export function velocityBarsSvg(v, w) {
  const vMax = ROBOT_VELOCITY_V_BOUNDS.max;
  const wAbsMax = Math.max(
    Math.abs(ROBOT_VELOCITY_W_BOUNDS.min),
    Math.abs(ROBOT_VELOCITY_W_BOUNDS.max)
  );
  const pv = Math.min(100, Math.max(0, ((Number(v) || 0) / vMax) * 100));
  const pw = Math.min(100, Math.max(0, (Math.abs(Number(w) || 0) / wAbsMax) * 100));
  const wBar = (70 * pw) / 100;
  const vBar = (70 * pv) / 100;
  return `
    <svg width="88" height="52" viewBox="0 0 88 52" aria-hidden="true">
      <text x="0" y="12" font-size="9" fill="#64748b" font-weight="800">v</text>
      <rect x="14" y="4" width="70" height="8" rx="4" fill="#e5eaf2"/>
      <rect x="14" y="4" width="${vBar}" height="8" rx="4" fill="#3498fd"/>
      <text x="0" y="34" font-size="9" fill="#64748b" font-weight="800">W</text>
      <rect x="14" y="26" width="70" height="8" rx="4" fill="#e5eaf2"/>
      <rect x="14" y="26" width="${wBar}" height="8" rx="4" fill="#8b5cf6"/>
    </svg>`;
}


function renderEmptyDashboard() {
  return `
    <div class="robot-dashboard robot-dashboard--empty">
      <div class="card robot-empty-card">
        <div class="robot-empty-icon" aria-hidden="true"><i class="fa-solid fa-robot"></i></div>
        <h2 class="robot-empty-title">Chưa có robot</h2>
        <p class="robot-empty-text">Thêm robot để theo dõi pin, vị trí và điều phối giao thuốc.</p>
        <button type="button" id="show-add-robot-modal" class="robot-empty-cta main-btn">Thêm robot</button>
      </div>
    </div>`;
}

export function renderRobotView(container, robots, stats, selectedRobotId = null, velocityDetailsOpen = false) {
  ensureBlinkBatteryStyle();

  if (!Array.isArray(robots) || robots.length === 0) {
    container.innerHTML = renderEmptyDashboard();
    return;
  }

  let mainRobot = robots[0];
  if (selectedRobotId) {
    const found = robots.find((r) => String(r.id) === String(selectedRobotId));
    if (found) mainRobot = found;
  }

  globalBatteryLowAlert(mainRobot.battery);

  // Hiển thị mọi robot trong lưới (kể cả robot đang xem bên trái) để tìm kiếm luôn thấy đúng máy
  const teamRobots = [...robots].sort((a, b) => {
    if (a.id === mainRobot.id) return -1;
    if (b.id === mainRobot.id) return 1;
    return 0;
  });
  const isOnline = mainRobot.online !== false;
  const battery = mainRobot.battery;
  const batteryLow = battery !== undefined && battery !== null && Number(battery) < 20;
  const batteryPct = battery !== undefined && battery !== null ? Math.min(100, Math.max(0, Number(battery))) : null;
  const batteryDisplay = batteryPct != null && !Number.isNaN(batteryPct) ? `${Math.round(batteryPct)}%` : "—";
  const floorDisplay = mainRobot.floor != null && mainRobot.floor !== "" ? String(mainRobot.floor) : "—";
  const deviceId = mainRobot.id != null ? String(mainRobot.id) : "—";
  const { v: vValRaw, w: wValRaw } = parseRobotVelocities(mainRobot);
  const vVal = clampRobotV(vValRaw);
  const wVal = clampRobotW(wValRaw);
  const vStr = String(vVal);
  const wStr = String(wVal);
  const missionPct = parseMissionPercent(mainRobot.deliveryProgressText);
  const missionLabel = mainRobot.deliveryProgressText || "0% Hoàn tất";
  const taskTitle = mainRobot.currentTaskLabel || mainRobot.task || "Không có nhiệm vụ";
  const taskDest = mainRobot.currentLocationLabel || mainRobot.location || "—";

  const statTotal = stats?.total ?? robots.length;
  const statOnline = stats?.online ?? robots.filter((r) => r.online !== false).length;
  const statOffline = stats?.offline ?? Math.max(0, statTotal - statOnline);

  const batteryBlinkClass = batteryLow ? " robot-metric-number--alert" : "";
  const batteryBlinkStyle = batteryLow ? "animation:blink-battery 1.2s ease-in-out infinite;" : "";

  const floorOptionsSet = new Set();
  teamRobots.forEach((r) => {
    const f = String(r.floor ?? "").trim();
    if (f) floorOptionsSet.add(f);
  });
  const floorOptions = Array.from(floorOptionsSet).sort((a, b) => a.localeCompare(b, "vi"));
  const floorSelectHtml =
    `<label class="visually-hidden" for="robot-team-floor">Lọc theo tầng</label>` +
    `<select id="robot-team-floor" class="robot-team-floor" aria-label="Lọc robot theo tầng">` +
    `<option value="">Tất cả tầng</option>` +
    floorOptions.map((f) => `<option value="${escapeAttr(f)}">${escapeAttr(f)}</option>`).join("") +
    `</select>`;

  const teamHtml = teamRobots.length
    ? `
    <div class="card robot-team-card">
      <div class="robot-team-head">
        <h3 class="robot-team-heading">Robot khác</h3>
        <div class="robot-team-filters">
          <div class="robot-team-search-wrap">
            <label class="visually-hidden" for="robot-team-search">Tìm robot theo tên hoặc mã</label>
            <input type="search" id="robot-team-search" class="robot-team-search" placeholder="Tên hoặc mã…" autocomplete="off" />
          </div>
          <div class="robot-team-floor-wrap">${floorSelectHtml}</div>
        </div>
      </div>
      <p id="robot-team-no-results" class="robot-team-no-results" hidden>Không có robot khớp bộ lọc.</p>
      <div class="robot-team-grid">
        ${teamRobots
          .map((r) => {
            const task = r.currentTaskLabel || r.task || "Không có nhiệm vụ";
            let loc = r.currentLocationLabel || r.location || "";
            loc = String(loc).replace(/^\s*Đến:\s*/i, "").trim();
            const metaLine = loc ? `${task} · ${loc}` : task;
            const idEsc = String(r.id).replace(/"/g, "&quot;");
            const nameRaw = String(r.name || r.id);
            const nameNorm = normalizeForSearch(nameRaw);
            const idNorm = normalizeForSearch(r.id || "");
            const nameCompact = compactAsciiAlnum(nameRaw);
            const idCompact = compactAsciiAlnum(r.id || "");
            const floorRaw = String(r.floor ?? "").trim();
            const isMainTile = String(r.id) === String(mainRobot.id);
            const titleTip = escapeAttr(`${r.name || r.id} — ${metaLine}`);
            const on = r.online !== false;
            const thumbInner = r.avatar
              ? `<img src="${r.avatar}" alt="" class="robot-team-thumb-img" />`
              : `<span class="robot-team-thumb-fa" aria-hidden="true"><i class="fa-solid fa-robot"></i></span>`;
            return `
          <button type="button" class="robot-list-item robot-team-tile${isMainTile ? " robot-team-tile--current" : ""}" data-robot-id="${idEsc}" data-name-norm="${escapeAttr(nameNorm)}" data-id-norm="${escapeAttr(idNorm)}" data-name-compact="${escapeAttr(nameCompact)}" data-id-compact="${escapeAttr(idCompact)}" data-robot-floor="${escapeAttr(floorRaw)}" title="${titleTip}"${isMainTile ? ' aria-current="true"' : ""}>
            <div class="robot-team-tile-thumb">${thumbInner}</div>
            <span class="robot-team-tile-name">${r.name || r.id}</span>
            <span class="robot-team-tile-floor">${floorRaw || "—"}</span>
            <span class="robot-team-tile-status ${on ? "is-online" : "is-offline"}">${on ? "Online" : "Off"}</span>
          </button>`;
          })
          .join("")}
      </div>
    </div>`
    : "";

  container.innerHTML = `
    <div class="robot-dashboard">
      <div class="robot-dashboard-stats" role="group" aria-label="Tổng quan robot">
        <div class="robot-summary-tile">
          <span class="robot-summary-value">${statTotal}</span>
          <span class="robot-summary-label">Tổng thiết bị</span>
        </div>
        <div class="robot-summary-tile robot-summary-tile--ok">
          <span class="robot-summary-value">${statOnline}</span>
          <span class="robot-summary-label">Đang online</span>
        </div>
        <div class="robot-summary-tile robot-summary-tile--muted">
          <span class="robot-summary-value">${statOffline}</span>
          <span class="robot-summary-label">Offline</span>
        </div>
      </div>

      <div class="robot-dashboard-grid">
        <div class="robot-dashboard-main">
          <div class="card robot-main-card">
            <div class="robot-main-layout">
              <div class="robot-hero-visual">
                ${
                  mainRobot.avatar
                    ? `<img src="${mainRobot.avatar}" alt="" class="robot-hero-avatar-img" />`
                    : `<div class="robot-hero-svg-wrap">${robotSVG}</div>`
                }
              </div>
              <div class="robot-main-body">
                <div class="robot-main-meta" style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span class="robot-status-badge ${isOnline ? "robot-status-badge--online" : "robot-status-badge--offline"}">
                      <span class="robot-status-dot" aria-hidden="true"></span>
                      ${isOnline ? "Đang online" : "Offline"}
                    </span>
                    <span class="robot-device-chip">Mã thiết bị <strong>#${deviceId}</strong></span>
                  </div>
                  <button type="button" class="delete-robot-btn" data-robot-id="${escapeAttr(mainRobot.id)}" style="min-height: unset; box-shadow: none; background: rgba(241, 245, 249, 0.75); border: 1px solid #cbd5e1; color: #64748b; padding: 5px 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-sizing: border-box; transition: all 0.2s ease-in-out; height: 30px;" onmouseover="this.style.background='#fee2e2'; this.style.borderColor='#fca5a5'; this.style.color='#dc2626'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='rgba(241, 245, 249, 0.75)'; this.style.borderColor='#cbd5e1'; this.style.color='#64748b'; this.style.transform='none';">
                    <i class="fa-solid fa-trash-can" style="font-size: 0.85rem;"></i> Xóa Robot
                  </button>
                </div>
                <h2 class="robot-main-title">${mainRobot.name || "Robot"}</h2>

                <div class="robot-metric-deck">
                  <div class="robot-metric-panel${batteryLow ? " robot-metric-panel--warn" : ""}">
                    <div class="robot-metric-label"><i class="fa-solid fa-battery-half" aria-hidden="true"></i> Pin</div>
                    <div id="battery-value" class="robot-metric-number${batteryBlinkClass}" style="${batteryBlinkStyle}">${batteryDisplay}</div>
                    ${
                      batteryPct != null
                        ? `<div class="robot-battery-bar" aria-hidden="true"><span class="robot-battery-bar-fill" style="width:${batteryPct}%"></span></div>`
                        : ""
                    }
                    ${batteryLow ? `<div id="battery-warning" class="robot-battery-warn" style="animation:blink-battery 1.2s ease-in-out infinite;">Pin yếu — cần sạc.</div>` : ""}
                  </div>
                  <!--
                  <div class="robot-metric-panel">
                    <div class="robot-metric-label"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Tầng / khu vực</div>
                    <div class="robot-metric-number robot-metric-number--loc">${floorDisplay}</div>
                  </div>
                  -->
                  <!-- [Mã cũ hiển thị Vị trí có hiệu ứng nhấp nháy: Đã được tắt theo yêu cầu] -->
                  <div class="robot-metric-panel">
                    <div class="robot-metric-label"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Vị trí</div>
                    <div class="robot-metric-number robot-metric-number--loc" style="margin-top: 8px; line-height: 1.2; font-size: ${mainRobot.proximityLabel ? '1.05rem' : '1.65rem'};">
                      ${mainRobot.proximityLabel ? `
                        <span class="proximity-badge" style="color: #059669; font-weight: 700; display: flex; align-items: center; gap: 4px;">
                          <span style="width: 6px; height: 6px; background-color: #10b981; border-radius: 50%; display: inline-block;"></span>
                          <!-- GỐC: Đang ở gần: ${escapeAttr(mainRobot.proximityLabel)} -->
                          Đang ở: ${escapeAttr(mainRobot.proximityLabel)}
                        </span>
                      ` : `
                        <span style="color: #133150;">${floorDisplay === '—' || !floorDisplay ? '—' : `Tầng ${escapeAttr(floorDisplay)}`}</span>
                      `}
                    </div>
                  </div>
                  <!--
                  <div class="robot-metric-panel" id="view-robot-map-btn" role="button" tabindex="0" title="Nhấp để xem bản đồ robot" style="cursor: pointer;">
                    <div class="robot-metric-label"><i class="fa-solid fa-map" aria-hidden="true"></i> Bản đồ</div>
                    <div class="robot-metric-number robot-metric-number--loc" style="color: var(--blue); display: flex; align-items: center; gap: 8px;">
                      <i class="fa-solid fa-eye" style="font-size: 1.1rem;"></i> Xem bản đồ
                    </div>
                  </div>
                  -->
                  <!--
                  <div class="robot-metric-panel" id="view-robot-map-btn" role="button" tabindex="0" title="Nhấp để xem bản đồ robot" style="cursor: pointer; position: relative;">
                    <div class="robot-metric-label"><i class="fa-solid fa-map" aria-hidden="true"></i> Bản đồ</div>
                    <div class="robot-metric-number robot-metric-number--loc" style="color: var(--blue); display: flex; flex-direction: column; align-items: flex-start; gap: 6px; line-height: 1.2;">
                      <span style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-eye" style="font-size: 1.1rem;"></i> Xem bản đồ
                      </span>
                      [Mã cũ hiển thị badge tiệm cận ở đây]
                    </div>
                  </div>
                  -->
                  <div class="robot-metric-panel" id="view-robot-map-btn" role="button" tabindex="0" title="Nhấp để xem bản đồ robot" style="cursor: pointer;">
                    <div class="robot-metric-label"><i class="fa-solid fa-map" aria-hidden="true"></i> Bản đồ</div>
                    <div class="robot-metric-number robot-metric-number--loc" style="color: var(--blue); display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                      <i class="fa-solid fa-eye" style="font-size: 1.1rem;"></i> Xem bản đồ
                    </div>
                  </div>
                </div>

                <div class="robot-mission-card" id="view-robot-missions-btn" role="button" tabindex="0" title="Nhấp để xem danh sách nhiệm vụ" style="cursor: pointer;">
                  <div class="robot-mission-head">
                    <span class="robot-mission-title">Nhiệm vụ hiện tại <i class="fa-solid fa-clock-rotate-left" style="font-size: 0.85rem; margin-left: 6px; color: var(--blue);"></i></span>
                    <span class="robot-mission-pct">${missionLabel}</span>
                  </div>
                  <div class="robot-mission-progress-track" aria-hidden="true">
                    <div class="robot-mission-progress-fill" style="width:${missionPct}%"></div>
                  </div>
                  <div class="robot-mission-body">
                    <div class="robot-mission-icon" aria-hidden="true"><img src="image/thuoc.png" alt="" class="robot-mission-icon-img" width="32" height="32" /></div>
                    <div>
                      <div class="robot-mission-task">${taskTitle}</div>
                      <div class="robot-mission-dest">Đến: ${taskDest}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="robot-speed-section" data-robot-id="${escapeAttr(String(mainRobot.id || ""))}">
              <div class="robot-speed-details" id="open-speed-modal-btn" role="button" tabindex="0" title="Nhấp để chỉnh v và W" style="cursor: pointer;">
                <div class="robot-speed-summary">
                  <div class="robot-speed-summary-layout">
                    <span class="robot-speed-summary-mini" aria-hidden="true">${velocityBarsSvg(vVal, wVal)}</span>
                    <div class="robot-speed-summary-text">
                      <span class="robot-speed-summary-title"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Tốc độ di chuyển</span>
                      <span class="robot-speed-summary-meta">v ${escapeAttr(vStr)} m/s · W ${escapeAttr(wStr)} rad/s</span>
                    </div>
                    <span class="robot-speed-summary-chevron" aria-hidden="true"><i class="fa-solid fa-chevron-right"></i></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="robot-dashboard-aside">
          <button type="button" id="show-add-robot-modal" class="robot-add-card">
            <span class="robot-add-icon" aria-hidden="true">+</span>
            <span class="robot-add-title">Thêm robot</span>
            <span class="robot-add-sub">Đăng ký thiết bị mới</span>
          </button>
          ${teamHtml}
        </aside>
      </div>
    </div>
  `;

  const teamSearch = container.querySelector("#robot-team-search");
  const teamFloor = container.querySelector("#robot-team-floor");
  const teamNoResults = container.querySelector("#robot-team-no-results");
  if (teamSearch && teamFloor) {
    teamSearch.value = typeof window.robotTeamSearchQuery === "string" ? window.robotTeamSearchQuery : "";
    teamFloor.value = typeof window.robotTeamFloorFilter === "string" ? window.robotTeamFloorFilter : "";

    const applyTeamFilters = () => {
      window.robotTeamSearchQuery = teamSearch.value;
      window.robotTeamFloorFilter = teamFloor.value;
      const q = normalizeForSearch(teamSearch.value);
      const qc = compactAsciiAlnum(teamSearch.value);
      const floorNeedle = normalizeForSearch(teamFloor.value);
      let visible = 0;
      container.querySelectorAll(".robot-team-tile").forEach((el) => {
        const nameN = el.getAttribute("data-name-norm") || "";
        const idN = el.getAttribute("data-id-norm") || "";
        const nameC = el.getAttribute("data-name-compact") || "";
        const idC = el.getAttribute("data-id-compact") || "";
        const floorVal = normalizeForSearch(el.getAttribute("data-robot-floor") || "");
        const textOk =
          !q ||
          nameN.includes(q) ||
          idN.includes(q) ||
          (qc.length > 0 && (nameC.includes(qc) || idC.includes(qc)));
        const floorOk =
          !floorNeedle ||
          floorVal === floorNeedle ||
          floorVal.includes(floorNeedle) ||
          floorNeedle.includes(floorVal);
        const show = textOk && floorOk;
        el.toggleAttribute("hidden", !show);
        el.classList.toggle("robot-team-tile--hidden", !show);
        if (show) visible += 1;
      });
      const hasFilter = Boolean(q || floorNeedle);
      if (teamNoResults) {
        if (visible === 0 && hasFilter) {
          teamNoResults.textContent =
            "Không có robot khớp. Thử «Tất cả tầng», xóa ô tìm hoặc tìm theo một phần tên/mã (ví dụ bỏ dấu chấm).";
          teamNoResults.hidden = false;
        } else {
          teamNoResults.hidden = true;
        }
      }
    };

    // Dùng oninput/onsearch để tránh chồng listener mỗi lần dashboard re-render (realtime Firebase)
    teamSearch.oninput = applyTeamFilters;
    teamSearch.onsearch = applyTeamFilters;
    teamFloor.onchange = applyTeamFilters;
    applyTeamFilters();
  }
}
