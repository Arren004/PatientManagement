// ============================================
// ROBOT CONTROLLER - Xử lý events robot
// ============================================

import robotService from "../services/robotService.js";
import { renderRobotView, velocityBarsSvg } from "../views/robotView.js";
import dbService from "../services/dbService.js";
import { showToast } from "../utils/ui.js";
const firebaseService = dbService;
import {
  DEFAULT_ROBOT_COMPARTMENTS,
  MIN_ROBOT_COMPARTMENTS,
  MAX_ROBOT_COMPARTMENTS,
  getRobotCompartmentCount,
  ROBOT_VELOCITY_V_BOUNDS,
  ROBOT_VELOCITY_W_BOUNDS,
} from "../data/constants.js";

class RobotController {

  constructor() {
    this.viewContainer = document.getElementById("view-robots");
    this.selectedRobotId = null;
    this.unsubscribe = null;
    this.unsubscribeDeliveryCommands = null;
    this.robots = [];
    this.deliveryCommands = [];
    /** Giữ hộp «Tốc độ di chuyển» mở qua các lần re-render (Firebase / sau khi lưu). */
    this._robotVelocityPanelOpen = false;
  }

  init() {
    // Render sẽ được gọi khi switch view
  }

  getTimestampValue(value) {
    if (!value) return 0;
    if (typeof value.toDate === "function") {
      return value.toDate().getTime();
    }
    if (typeof value.seconds === "number") {
      return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /*
  getProximityLabel(robot) {
    if (!robot || !robot.id) return "";
    
    // Đọc các nhãn đã lưu từ localStorage
    const savedLabels = JSON.parse(localStorage.getItem(`robot_map_labels_${robot.id}`) || "[]");
    if (!savedLabels.length) return "";

    // Lấy pose từ state (Cập nhật real-time qua CouchDB từ backend)
    const pose = robot.state && robot.state.pose ? robot.state.pose : null;
    if (!pose || typeof pose.x !== "number" || typeof pose.y !== "number") return "";

    let minDistance = Infinity;
    let closestLabel = null;

    savedLabels.forEach((lbl) => {
      const dist = Math.hypot(pose.x - lbl.x, pose.y - lbl.y);
      if (dist < minDistance) {
        minDistance = dist;
        closestLabel = lbl;
      }
    });

    const threshold = 1.5; // Ngưỡng 1.5 mét
    if (closestLabel && minDistance <= threshold) {
      return closestLabel.text;
    }
    return "";
  }
  */

  getProximityLabel(robot) {
    if (!robot || !robot.id) return "";
    
    // Đọc các nhãn đã lưu từ localStorage
    const savedLabels = JSON.parse(localStorage.getItem(`robot_map_labels_${robot.id}`) || "[]");
    console.log(`[getProximityLabel] robot.id=${robot.id}, savedLabels count=${savedLabels.length}`);
    if (!savedLabels.length) return "";

    // Lấy pose từ state (Cập nhật real-time qua CouchDB từ backend) hoặc bộ nhớ đệm local
    let pose = robot.state && robot.state.pose ? robot.state.pose : null;
    if (!pose) {
      const cached = localStorage.getItem(`robot_pose_cache_${robot.id}`);
      console.log(`[getProximityLabel] state pose is null, cached pose from localStorage:`, cached);
      if (cached) {
        try {
          pose = JSON.parse(cached);
        } catch (e) {
          pose = null;
        }
      }
    }
    if (!pose || typeof pose.x !== "number" || typeof pose.y !== "number") {
      console.log(`[getProximityLabel] pose is invalid:`, pose);
      return "";
    }

    let minDistance = Infinity;
    let closestLabel = null;

    /* GỐC: Tính khoảng cách tất cả các nhãn
    savedLabels.forEach((lbl) => {
      const dist = Math.hypot(pose.x - lbl.x, pose.y - lbl.y);
      if (dist < minDistance) {
        minDistance = dist;
        closestLabel = lbl;
      }
    });
    */

    // CẢI TIẾN: Chỉ nhận diện khi robot đi vào trong Vùng Bao Chữ Nhật (Bounding Box) của phòng bệnh
    savedLabels.forEach((lbl) => {
      if (!lbl.text.toLowerCase().includes("phòng")) return;

      const w = lbl.w || 3.0; // chiều rộng mặc định 3m
      const h = lbl.h || 2.5; // chiều cao mặc định 2.5m
      const dx = Math.abs(pose.x - lbl.x);
      const dy = Math.abs(pose.y - lbl.y);

      if (dx <= w / 2 && dy <= h / 2) {
        const dist = Math.hypot(pose.x - lbl.x, pose.y - lbl.y);
        if (dist < minDistance) {
          minDistance = dist;
          closestLabel = lbl;
        }
      }
    });

    console.log(`[getProximityLabel] closestLabel=${closestLabel ? closestLabel.text : "none"}, distance=${minDistance.toFixed(2)}m (trong vùng bao)`);
    /* GỐC: Trả về nhãn phòng kèm khoảng cách
    if (closestLabel) {
      return `${closestLabel.text} (cách ${minDistance.toFixed(1)}m)`;
    }
    */
    // CẢI TIẾN: Chỉ trả về tên phòng mà không cần khoảng cách
    if (closestLabel) {
      return closestLabel.text;
    }
    return "";
  }

  buildRobotMission(robot, commands = []) {
    const activeCommands = commands
      .filter((command) => String(command.robotId || "") === String(robot.id) && command.status === "delivering")
      .sort((a, b) => this.getTimestampValue(b.createdAt) - this.getTimestampValue(a.createdAt));

    const proximityLabel = this.getProximityLabel(robot);

    if (!activeCommands.length) {
      const task = (!robot.task || robot.task === "Idle") ? "Không có nhiệm vụ" : robot.task;
      return {
        currentTaskLabel: task,
        currentLocationLabel: robot.location || "---",
        deliveryProgressText: "Đang rảnh",
        proximityLabel: proximityLabel
      };
    }

    const activeCommand = activeCommands[0];
    const bins = Array.isArray(activeCommand.bins) ? activeCommand.bins : [];
    const currentBin = bins.find((bin) => String(bin.status || "").toLowerCase() !== "delivered") || bins[0] || {};
    const deliveredCount = bins.filter((bin) => String(bin.status || "").toLowerCase() === "delivered").length;
    const progress = bins.length ? Math.round((deliveredCount / bins.length) * 100) : 0;
    const room = currentBin.room || "---";
    const bed = currentBin.bed || "---";
    const patientName = currentBin.patientName || currentBin.name || "Không rõ bệnh nhân";

    return {
      currentTaskLabel: patientName,
      currentLocationLabel: `Phòng ${room}, Giường ${String(bed).replace(/^giường\s+/i, '')}`,
      deliveryProgressText: `${progress}% Hoàn tất`,
      currentCommand: activeCommand,
      proximityLabel: proximityLabel
    };
  }

  renderDashboard(robots, commands = [], force = false) {
    if (!force) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        return;
      }
      const modals = [
        "#add-robot-modal",
        "#speed-settings-modal"
      ];
      for (const selector of modals) {
        const modal = document.querySelector(selector);
        if (modal) {
          const style = window.getComputedStyle(modal);
          if (style.display !== "none" && style.visibility !== "hidden") {
            return;
          }
        }
      }
    }

    this.robots = Array.isArray(robots) ? robots : [];
    this.deliveryCommands = Array.isArray(commands) ? commands : [];

    const enrichedRobots = this.robots.map((robot) => ({
      ...robot,
      ...this.buildRobotMission(robot, this.deliveryCommands),
    }));

    const stats = {
      total: enrichedRobots.length,
      online: enrichedRobots.filter((r) => r.online).length,
      offline: enrichedRobots.length - enrichedRobots.filter((r) => r.online).length,
    };

    if (!this.selectedRobotId && enrichedRobots.length) {
      this.selectedRobotId = enrichedRobots[0].id;
    }

    renderRobotView(
      this.viewContainer,
      enrichedRobots,
      stats,
      this.selectedRobotId
    );
    this.setupEventListeners();
  }

  async renderView() {
    if (!this.unsubscribe) {
      this.unsubscribe = await robotService.listenRobotsRealtime((robots) => {
        this.robots = Array.isArray(robots) ? robots : [];
        this.renderDashboard(this.robots, this.deliveryCommands);
      });
    }

    if (!this.unsubscribeDeliveryCommands) {
      this.unsubscribeDeliveryCommands = firebaseService.listenDeliveryCommandsRealtime((commands) => {
        this.deliveryCommands = Array.isArray(commands) ? commands : [];
        this.renderDashboard(this.robots, this.deliveryCommands);
      });
    }

    this.renderDashboard(this.robots, this.deliveryCommands);
    this.startBackgroundMqttListener();
  }

  startBackgroundMqttListener() {
    if (this._bgMqttClient) return;

    const startListener = () => {
      if (this._bgMqttClient) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const port = window.location.protocol === "https:" ? "8084" : "8083";
      this._bgMqttClient = mqtt.connect(`${protocol}://broker.emqx.io:${port}/mqtt`);

      this._bgMqttClient.on("connect", () => {
        console.log("[BG MQTT] Connected to EMQX broker for background pose tracking");
        this._bgMqttClient.subscribe("/robots/+/pose");
      });

      this._bgMqttClient.on("message", (topic, message) => {
        try {
          const topicParts = topic.split("/");
          const robotId = topicParts[2];
          if (!robotId) return;

          const payload = JSON.parse(message.toString());
          console.log(`[BG MQTT] Received pose for robot ${robotId}:`, payload);
          if (typeof payload.x === "number" && typeof payload.y === "number") {
            const pose = { x: payload.x, y: payload.y, theta: payload.theta || 0 };
            localStorage.setItem(`robot_pose_cache_${robotId}`, JSON.stringify(pose));

            // Cập nhật ngầm phần tử HTML ngoài Dashboard mà không cần re-render toàn bộ
            const robot = this.robots.find(r => String(r.id) === String(robotId));
            if (robot) {
              if (!robot.state) robot.state = {};
              robot.state.pose = pose;

              if (String(robotId) === String(this.selectedRobotId)) {
                const proximityLabel = this.getProximityLabel(robot);
                const locContainer = this.viewContainer.querySelector(".robot-metric-number--loc");
                if (locContainer && locContainer.parentElement) {
                  const labelEl = locContainer.parentElement.querySelector(".robot-metric-label");
                  if (labelEl && labelEl.innerText.includes("Vị trí")) {
                    if (proximityLabel) {
                      locContainer.style.fontSize = "1.05rem";
                      /* GỐC: Hiển thị "Đang ở gần:"
                      locContainer.innerHTML = `
                        <span class="proximity-badge" style="color: #059669; font-weight: 700; display: flex; align-items: center; gap: 4px;">
                          <span style="width: 6px; height: 6px; background-color: #10b981; border-radius: 50%; display: inline-block;"></span>
                          Đang ở gần: ${proximityLabel}
                        </span>
                      `;
                      */
                      // CẢI TIẾN: Hiển thị "Đang ở:"
                      locContainer.innerHTML = `
                        <span class="proximity-badge" style="color: #059669; font-weight: 700; display: flex; align-items: center; gap: 4px;">
                          <span style="width: 6px; height: 6px; background-color: #10b981; border-radius: 50%; display: inline-block;"></span>
                          Đang ở: ${proximityLabel}
                        </span>
                      `;
                    } else {
                      const floorDisplay = robot.floor != null && robot.floor !== "" ? String(robot.floor) : "—";
                      locContainer.style.fontSize = "1.65rem";
                      locContainer.innerHTML = `<span style="color: #133150;">${floorDisplay === '—' || !floorDisplay ? '—' : `Tầng ${floorDisplay}`}</span>`;
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("[BG MQTT] Error processing background pose:", e);
        }
      });
    };

    if (!window.mqtt) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/mqtt/dist/mqtt.min.js";
      script.onload = startListener;
      document.head.appendChild(script);
    } else {
      startListener();
    }
  }

  setupEventListeners() {
    // Sự kiện mở modal thêm robot
    const showAddBtn = this.viewContainer.querySelector("#show-add-robot-modal");
    if (showAddBtn) {
      showAddBtn.addEventListener("click", () => {
        this.showAddRobotModal();
      });
    }

    // Sự kiện xóa robot
    const deleteBtn = this.viewContainer.querySelector(".delete-robot-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const robotId = deleteBtn.dataset.robotId;
        const robot = this.robots.find((r) => String(r.id) === String(robotId));
        const robotName = robot ? robot.name : "Robot";

        if (confirm(`Bạn có chắc chắn muốn xóa Robot "${robotName}" khỏi hệ thống không?`)) {
          robotService.deleteRobot(robotId).then((res) => {
            if (res.success) {
              showToast(`Đã xóa Robot "${robotName}" thành công.`);
              if (String(this.selectedRobotId) === String(robotId)) {
                this.selectedRobotId = null;
              }
              this.renderDashboard(this.robots.filter(r => String(r.id) !== String(robotId)), this.deliveryCommands, true);
            } else {
              showToast(res.message || "Không thể xóa robot.", "danger");
            }
          });
        }
      });
    }

    const openSpeedModalBtn = this.viewContainer.querySelector("#open-speed-modal-btn");
    if (openSpeedModalBtn) {
      openSpeedModalBtn.addEventListener("click", () => {
        const velSection = this.viewContainer.querySelector(".robot-speed-section[data-robot-id]");
        if (velSection) {
          const robotId = velSection.dataset.robotId;
          const robot = this.robots.find((r) => String(r.id) === String(robotId));
          if (robot) {
            this.showSpeedModal(robot);
          }
        }
      });
    }

    const viewMissionsBtn = this.viewContainer.querySelector("#view-robot-missions-btn");
    if (viewMissionsBtn) {
      viewMissionsBtn.addEventListener("click", () => {
        this.showRobotMissionsModal();
      });
    }

    const viewMapBtn = this.viewContainer.querySelector("#view-robot-map-btn");
    if (viewMapBtn) {
      viewMapBtn.addEventListener("click", () => {
        const robot = this.robots.find((r) => String(r.id) === String(this.selectedRobotId));
        if (robot) {
          this.showMapModal(robot);
        }
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
        <button id="close-add-robot-modal" style="position:absolute;top:12px;right:12px;background:none;border:none;font-size:22px;cursor:pointer;">  <img src="image/close.png "alt="close" style="width:18px;height:18px;"></button>
        <h2 style="margin-bottom:18px;">Thêm robot mới</h2>
        <form id="add-robot-form-modal">
          <div style="margin-bottom:14px;">
            <label for="robot-id-input-modal">Robot ID</label>
            <input type="text" id="robot-id-input-modal" placeholder="Nhập id robot hoặc để trống để tự sinh" style="width:100%;padding:8px;margin-top:4px;" />
          </div>
          <div style="margin-bottom:14px;">
            <label for="robot-name-input-modal">Tên robot</label>
            <input type="text" id="robot-name-input-modal" required placeholder="Nhập tên robot" style="width:100%;padding:8px;margin-top:4px;" />
          </div>
          <div style="margin-bottom:14px;">
            <label for="robot-compartment-input">Số ngăn chứa thuốc</label>
            <input type="number" id="robot-compartment-input" min="${MIN_ROBOT_COMPARTMENTS}" max="${MAX_ROBOT_COMPARTMENTS}" value="${DEFAULT_ROBOT_COMPARTMENTS}" style="width:100%;padding:8px;margin-top:4px;" />
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
    modal.querySelector("#close-add-robot-modal").onclick = () => {
      modal.remove();
      this.renderDashboard(this.robots, this.deliveryCommands, true);
    };

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
      const idInput = modal.querySelector("#robot-id-input-modal").value.trim();
      const name = modal.querySelector("#robot-name-input-modal").value.trim();
      const floor = modal.querySelector("#robot-floor-input").value.trim() || "1st";
      const location = modal.querySelector("#robot-location-input").value.trim() || "";
      const compartmentCount = getRobotCompartmentCount({
        compartmentCount: modal.querySelector("#robot-compartment-input").value,
      });
      if (!name) return;
      const id = idInput || (name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now());
      await robotService.addRobotToFirestore({
        id,
        name,
        battery: 100,
        floor,
        location,
        online: true,
        task: "Idle",
        avatar: avatarBase64,
        v: 0.5,
        w: 1.0,
        compartmentCount,
      });
      modal.remove();
      this.renderDashboard(this.robots, this.deliveryCommands, true);
    };
  }

  showSpeedModal(robot) {
    if (document.getElementById("speed-settings-modal")) return;

    const parseRobotVelocities = (robot) => {
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
    };

    const clampRobotV = (n) => {
      const { min, max } = ROBOT_VELOCITY_V_BOUNDS;
      const x = Number(n);
      if (Number.isNaN(x)) return min;
      return Math.min(max, Math.max(min, x));
    };

    const clampRobotW = (n) => {
      const { min, max } = ROBOT_VELOCITY_W_BOUNDS;
      const x = Number(n);
      if (Number.isNaN(x)) return 0;
      return Math.min(max, Math.max(min, x));
    };

    const { v: vValRaw, w: wValRaw } = parseRobotVelocities(robot);
    const initialV = clampRobotV(vValRaw);
    const initialW = clampRobotW(wValRaw);

    let currentV = initialV;
    let currentW = initialW;

    const modal = document.createElement("div");
    modal.id = "speed-settings-modal";
    modal.className = "modal-overlay show";
    modal.style = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(18, 29, 46, 0.46);z-index:1000;display:flex;align-items:center;justify-content:center;`;
    
    const robotNameEsc = String(robot.name || robot.id).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const vStr = String(initialV);
    const wStr = String(initialW);

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 500px; padding: 24px; border-radius: var(--card-radius); background: #fff; box-shadow: var(--card-shadow-hover); position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 14px;">
          <h3 style="margin: 0; font-size: 1.35rem; font-weight: 800; color: #133150; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-sliders" style="color: var(--blue);"></i>
            Cài đặt tốc độ
          </h3>
          <button type="button" id="close-speed-modal" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #64748b; line-height: 1;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        
        <div style="display: flex; gap: 16px; align-items: center; background: #f8fafc; padding: 14px; border-radius: 12px; margin-bottom: 20px; border: 1px dashed #cbd5e1;">
          <div id="modal-speed-chart" class="robot-speed-chart" style="margin: 0;">
            ${velocityBarsSvg(currentV, currentW)}
          </div>
          <div style="flex: 1;">
            <div style="font-size: 0.95rem; font-weight: 800; color: #1e293b;">Bản xem trước tốc độ</div>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 3px; line-height: 1.4;">
              Thanh di chuyển <strong style="color: #3498fd;">v</strong> và xoay <strong style="color: #8b5cf6;">W</strong> thay đổi trực tiếp theo cấu hình bên dưới.
            </div>
          </div>
        </div>

        <form id="speed-settings-form">
          <div class="robot-speed-controls" style="margin-bottom: 24px;">
            <p class="robot-vel-lead" style="margin-bottom: 16px; font-size: 0.92rem; color: #475569; line-height: 1.5;">
              Cấu hình tốc độ thẳng <strong>v</strong> (m/s) và tốc độ quay <strong>W</strong> (rad/s) cho robot <strong>${robotNameEsc}</strong>.
            </p>
            
            <div class="robot-vel-rows" style="display: flex; flex-direction: column; gap: 16px;">
              <div class="robot-vel-field">
                <label class="robot-vel-label" for="modal-vel-v-range" style="display: flex; justify-content: space-between; font-weight: 700; color: #334155; margin-bottom: 6px; font-size: 0.9rem;">
                  <span>v (m/s)</span>
                  <span style="color: #64748b; font-size: 0.8rem; font-weight: 500;">Giới hạn: ${ROBOT_VELOCITY_V_BOUNDS.min} - ${ROBOT_VELOCITY_V_BOUNDS.max} m/s</span>
                </label>
                <div class="robot-speed-row">
                  <input id="modal-vel-v-range" class="robot-speed-range" type="range" min="${ROBOT_VELOCITY_V_BOUNDS.min}" max="${ROBOT_VELOCITY_V_BOUNDS.max}" step="${ROBOT_VELOCITY_V_BOUNDS.step}" value="${vStr}" />
                  <div class="robot-speed-readout-wrap">
                    <input id="modal-vel-v-number" class="robot-speed-number" type="number" min="${ROBOT_VELOCITY_V_BOUNDS.min}" max="${ROBOT_VELOCITY_V_BOUNDS.max}" step="${ROBOT_VELOCITY_V_BOUNDS.step}" value="${vStr}" inputmode="decimal" />
                    <span class="robot-vel-unit-suffix">m/s</span>
                  </div>
                </div>
              </div>
              
              <div class="robot-vel-field">
                <label class="robot-vel-label" for="modal-vel-w-range" style="display: flex; justify-content: space-between; font-weight: 700; color: #334155; margin-bottom: 6px; font-size: 0.9rem;">
                  <span>W (rad/s)</span>
                  <span style="color: #64748b; font-size: 0.8rem; font-weight: 500;">Giới hạn: ${ROBOT_VELOCITY_W_BOUNDS.min} - ${ROBOT_VELOCITY_W_BOUNDS.max} rad/s</span>
                </label>
                <div class="robot-speed-row">
                  <input id="modal-vel-w-range" class="robot-speed-range" type="range" min="${ROBOT_VELOCITY_W_BOUNDS.min}" max="${ROBOT_VELOCITY_W_BOUNDS.max}" step="${ROBOT_VELOCITY_W_BOUNDS.step}" value="${wStr}" />
                  <div class="robot-speed-readout-wrap">
                    <input id="modal-vel-w-number" class="robot-speed-number" type="number" min="${ROBOT_VELOCITY_W_BOUNDS.min}" max="${ROBOT_VELOCITY_W_BOUNDS.max}" step="${ROBOT_VELOCITY_W_BOUNDS.step}" value="${wStr}" inputmode="decimal" />
                    <span class="robot-vel-unit-suffix">rad/s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-actions" style="margin-top: 10px;">
            <button type="button" id="cancel-speed-btn" class="ghost-btn modal-cancel" style="padding: 12px; font-weight: 700; border-radius: 12px; cursor: pointer; transition: all 0.15s ease;">Hủy</button>
            <button type="submit" class="main-btn" style="padding: 12px; font-weight: 700; border-radius: 12px; cursor: pointer; background: var(--blue); color: #fff; border: none; transition: all 0.15s ease;">Xác nhận</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const vRange = modal.querySelector("#modal-vel-v-range");
    const vNumber = modal.querySelector("#modal-vel-v-number");
    const wRange = modal.querySelector("#modal-vel-w-range");
    const wNumber = modal.querySelector("#modal-vel-w-number");
    const speedChart = modal.querySelector("#modal-speed-chart");

    const updatePreview = () => {
      if (speedChart) {
        speedChart.innerHTML = velocityBarsSvg(currentV, currentW);
      }
    };

    const syncV = () => {
      currentV = clampRobotV(vRange.value);
      vRange.value = String(currentV);
      vNumber.value = String(currentV);
      vRange.setAttribute("aria-valuenow", String(currentV));
      updatePreview();
    };

    const syncW = () => {
      currentW = clampRobotW(wRange.value);
      wRange.value = String(currentW);
      wNumber.value = String(currentW);
      wRange.setAttribute("aria-valuenow", String(currentW));
      updatePreview();
    };

    vRange.addEventListener("input", syncV);
    vNumber.addEventListener("input", () => {
      if (vNumber.value === "" || vNumber.value === "-") return;
      currentV = clampRobotV(vNumber.value);
      vRange.value = String(currentV);
      vRange.setAttribute("aria-valuenow", String(currentV));
      updatePreview();
    });
    vNumber.addEventListener("blur", () => {
      if (vNumber.value === "" || Number.isNaN(Number(vNumber.value))) {
        vNumber.value = vRange.value;
        return;
      }
      currentV = clampRobotV(vNumber.value);
      vNumber.value = String(currentV);
      vRange.value = String(currentV);
      vRange.setAttribute("aria-valuenow", String(currentV));
      updatePreview();
    });

    wRange.addEventListener("input", syncW);
    wNumber.addEventListener("input", () => {
      if (wNumber.value === "" || wNumber.value === "-") return;
      currentW = clampRobotW(wNumber.value);
      wRange.value = String(currentW);
      wRange.setAttribute("aria-valuenow", String(currentW));
      updatePreview();
    });
    wNumber.addEventListener("blur", () => {
      if (wNumber.value === "" || Number.isNaN(Number(wNumber.value))) {
        wNumber.value = wRange.value;
        return;
      }
      currentW = clampRobotW(wNumber.value);
      wNumber.value = String(currentW);
      wRange.value = String(currentW);
      wRange.setAttribute("aria-valuenow", String(currentW));
      updatePreview();
    });

    const closeModal = () => {
      modal.remove();
      this.renderDashboard(this.robots, this.deliveryCommands, true);
    };
    modal.querySelector("#close-speed-modal").onclick = closeModal;
    modal.querySelector("#cancel-speed-btn").onclick = closeModal;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    modal.querySelector("#speed-settings-form").onsubmit = async (e) => {
      e.preventDefault();
      await robotService.updateRobotVelocityInFirestore(robot.id, currentV, currentW);
      closeModal();
      this.renderView();
    };
  }

  showRobotMissionsModal() {
    if (document.getElementById("robot-missions-modal")) return;

    const robot = this.robots.find((r) => String(r.id) === String(this.selectedRobotId));
    if (!robot) return;

    const robotName = robot.name || robot.id;
    const robotMissions = this.deliveryCommands
      .filter((command) => String(command.robotId || "") === String(robot.id))
      .sort((a, b) => this.getTimestampValue(b.createdAt) - this.getTimestampValue(a.createdAt));

    const modal = document.createElement("div");
    modal.id = "robot-missions-modal";
    modal.className = "modal-overlay show";
    let listHtml = "";
    if (robotMissions.length === 0) {
      listHtml = `
        <div style="text-align:center;padding:40px 20px;color:#64748b;">
          <i class="fa-solid fa-list-check" style="font-size:3rem;color:#cbd5e1;margin-bottom:16px;"></i>
          <p style="font-size:1rem;font-weight:600;margin:0;">Chưa có nhiệm vụ nào</p>
          <p style="font-size:0.85rem;color:#94a3b8;margin-top:4px;">Các ca điều phối giao thuốc của robot này sẽ xuất hiện tại đây.</p>
        </div>
      `;
    } else {
      listHtml = `
        <div style="max-height:450px;overflow-y:auto;padding-right:4px;display:flex;flex-direction:column;gap:14px;" class="custom-scrollbar">
          ${robotMissions.map((mission) => {
            const dateStr = mission.createdAt ? new Date(this.getTimestampValue(mission.createdAt)).toLocaleString("vi-VN") : "—";
            const status = mission.status || "delivering";
            
            let statusBadge = "";
            if (status === "delivered") {
              statusBadge = `<span style="background:#bbf7d0;color:#166534;padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;">Đã hoàn thành</span>`;
            } else if (status === "failed") {
              statusBadge = `<span style="background:#fee2e2;color:#991b1b;padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;">Thất bại</span>`;
            } else {
              statusBadge = `<span style="background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;animation: pulse-mission 1.5s infinite;">Đang đi giao</span>`;
            }

            const bins = Array.isArray(mission.bins) ? mission.bins : [];
            const binsList = bins.map((bin) => {
              const patientName = bin.patientName || bin.name || "Bệnh nhân";
              const binStatus = bin.status || "delivering";
              let binStatusIcon = "";
              if (binStatus === "delivered") {
                binStatusIcon = `<span style="color:#10b981;font-weight:700;font-size:0.8rem;"><i class="fa-solid fa-circle-check"></i> Đã giao</span>`;
              } else if (binStatus === "failed") {
                binStatusIcon = `<span style="color:#ef4444;font-weight:700;font-size:0.8rem;"><i class="fa-solid fa-circle-xmark"></i> Thất bại ${bin.failureReason ? `(${bin.failureReason})` : ''}</span>`;
              } else {
                binStatusIcon = `<span style="color:#3b82f6;font-weight:700;font-size:0.8rem;"><i class="fa-solid fa-spinner fa-spin"></i> Đang giao</span>`;
              }

              return `
                <div style="background:#f8fafc;border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;border:1px solid #e2e8f0;">
                  <div>
                    <span style="font-weight:700;color:#1e293b;font-size:0.88rem;">Ngăn ${bin.slot}</span>
                    <span style="margin:0 6px;color:#94a3b8;">·</span>
                    <span style="color:#334155;font-weight:600;font-size:0.88rem;">${patientName}</span>
                    <span style="font-size:0.8rem;color:#64748b;display:block;margin-top:2px;">
                      Phòng ${bin.room || "—"}, Giường ${bin.bed ? String(bin.bed).replace(/^giường\s+/i, '') : "—"}
                      ${bin.note ? ` | <span style="font-style:italic;">Ghi chú: ${bin.note}</span>` : ""}
                    </span>
                  </div>
                  <div>
                    ${binStatusIcon}
                  </div>
                </div>
              `;
            }).join("");

            return `
              <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);position:relative;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #f1f5f9;padding-bottom:10px;">
                  <div>
                    <span style="font-size:0.8rem;color:#64748b;display:block;">Mã đơn: <strong style="color:#334155;">${mission._id || mission.id || "—"}</strong></span>
                    <span style="font-size:0.8rem;color:#94a3b8;display:block;margin-top:2px;"><i class="fa-regular fa-clock"></i> ${dateStr}</span>
                  </div>
                  <div>
                    ${statusBadge}
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${binsList}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    modal.innerHTML = `
      <style>
        @keyframes pulse-mission {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      </style>
      <div class="modal-card" style="max-width: 580px; width:95%; padding: 24px; border-radius: var(--card-radius); background: #fff; box-shadow: var(--card-shadow-hover); position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 14px;">
          <h3 style="margin: 0; font-size: 1.35rem; font-weight: 800; color: #133150; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-clock-rotate-left" style="color: var(--blue);"></i>
            Lịch sử nhiệm vụ: ${robotName}
          </h3>
          <button type="button" id="close-missions-modal" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #64748b; line-height: 1;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        
        ${listHtml}

        <div class="modal-actions" style="margin-top: 20px; border-top:1px solid #f1f5f9; padding-top:14px; display:flex; justify-content:flex-end;">
          <button type="button" id="close-missions-btn" class="main-btn" style="padding: 10px 20px; font-weight: 700; border-radius: 12px; cursor: pointer; background: var(--blue); color: #fff; border: none;">Đóng</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector("#close-missions-modal").onclick = closeModal;
    modal.querySelector("#close-missions-btn").onclick = closeModal;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  showMapModal(robot) {
    if (document.getElementById("robot-map-modal")) return;

    const modal = document.createElement("div");
    modal.id = "robot-map-modal";
    modal.style = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.65);backdrop-filter:blur(6px);z-index:1000;display:flex;align-items:center;justify-content:center;`;
    modal.innerHTML = `
      <div style="background:#ffffff;padding:24px;border-radius:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);position:relative;max-width:95vw;width:1050px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
        <!-- GỐC: Nút đóng ở góc và không có nút cờ lê chỉnh sửa ở đây -->
        <!-- <button id="close-robot-map-modal" style="position:absolute;top:20px;right:20px;background:#f1f5f9;border:none;cursor:pointer;padding:6px;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;"><img src="image/close.png" alt="close" style="width:14px;height:14px;"></button> -->
        
        <!-- CẢI TIẾN: Nút đóng và nút cờ lê nhỏ chỉnh sửa nằm ở góc phải trên -->
        <button id="close-robot-map-modal" style="position:absolute;top:20px;right:20px;background:#f1f5f9;border:none;cursor:pointer;padding:6px;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;z-index:10;" title="Đóng bản đồ"><img src="image/close.png" alt="close" style="width:14px;height:14px;"></button>
        <button id="btn-edit-labels" style="position:absolute;top:20px;right:60px;background:#f1f5f9;border:none;cursor:pointer;padding:6px;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;z-index:10;" title="Chỉnh sửa nhãn dán (Thêm/Xóa/Di chuyển)">
          <img src="image/cole.png" alt="edit" style="width:14px;height:14px;transition:all 0.2s;">
        </button>

        <div style="display:flex;align-items:center;gap:12px;margin-right:80px;">
          <h3 style="margin:0;font-size:1.4rem;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">Bản đồ Robot: ${robot.name || robot.id}</h3>
          <span id="map-mqtt-status" style="font-size:0.75rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#f1f5f9;color:#64748b;transition:all 0.3s;">Đang kết nối...</span>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:12px 16px;border-radius:14px;font-size:0.88rem;color:#475569;border:1px solid #f1f5f9;">
          <div style="display:flex;flex-direction:column;gap:4px;text-align:left;">
            <span>Tọa độ robot: <strong id="map-robot-coords" style="color:#2563eb;font-family:monospace;font-size:0.95rem;">Chờ dữ liệu...</strong></span>
            <!-- GỐC: <span id="map-robot-proximity" style="font-size:0.85rem;color:#059669;font-weight:700;display:none;"><i class="fa-solid fa-location-dot"></i> Đang ở gần: <span id="proximity-label-name" style="color:#047857;">—</span></span> -->
            <span id="map-robot-proximity" style="font-size:0.85rem;color:#059669;font-weight:700;display:none;"><i class="fa-solid fa-location-dot"></i> Đang ở: <span id="proximity-label-name" style="color:#047857;">—</span></span>
          </div>
          <span id="map-size-info" style="font-size:0.8rem;color:#94a3b8;font-weight:600;">Chờ dữ liệu bản đồ...</span>
        </div>

        <!-- GỐC: Dòng nút 'Ghi chú nhãn' cũ -->
        <!--
        <div style="display:flex;gap:12px;align-items:center;padding:0 4px;">
          <button id="btn-edit-labels" style="font-size:0.8rem;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#475569;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.2s;">
            <i class="fa-solid fa-pen-to-square"></i> <span>Ghi chú nhãn</span>
          </button>
          <span id="label-edit-mode-indicator" style="font-size:0.75rem;color:#ef4444;font-weight:700;display:none;">• Click lên bản đồ để thêm nhãn mới, click nhãn cũ để xóa nhãn</span>
        </div>
        -->

        <!-- CẢI TIẾN: Chỉ hiển thị dòng hướng dẫn khi bật chế độ cờ lê chỉnh sửa (kèm hướng dẫn kéo dãn vùng bao) -->
        <div style="display:flex;gap:12px;align-items:center;padding:0 4px;min-height:20px;">
          <span id="label-edit-mode-indicator" style="font-size:0.75rem;color:#ef4444;font-weight:700;display:none;">
            <i class="fa-solid fa-circle-info"></i> • Kéo thả nhãn để di chuyển · Kéo góc dưới-phải vùng bao để thay đổi kích thước · Click vùng trống để thêm mới · Click nhãn cũ để xóa nhãn
          </span>
        </div>

        <div style="width:100%;background:#f8fafc;border-radius:16px;overflow:auto;display:flex;align-items:center;justify-content:center;border:1px solid #e2e8f0;min-height:480px;max-height:70vh;padding:16px;box-sizing:border-box;position:relative;">
          <canvas id="modal-map-canvas" style="background:#cbd5e1;display:block;border-radius:12px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.05);image-rendering:pixelated;image-rendering:crisp-edges;cursor:default;"></canvas>
        </div>

        <div style="display:flex;justify-content:center;gap:20px;font-size:0.8rem;color:#475569;margin-top:4px;border-top:1px solid #f1f5f9;padding-top:12px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:14px;height:14px;background:#ffffff;border:1px solid #cbd5e1;border-radius:3px;"></span>
            <span>Vùng trống (Đi được)</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:14px;height:14px;background:#1e293b;border-radius:3px;"></span>
            <span>Vật cản / Tường</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="display:inline-block;width:14px;height:14px;background:#d0d7de;border-radius:3px;"></span>
            <span>Vùng chưa quét</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const startMqttConnection = () => {
      const robotId = robot.id || "robot_01";
      const statusEl = document.getElementById("map-mqtt-status");
      const coordsEl = document.getElementById("map-robot-coords");
      const sizeEl = document.getElementById("map-size-info");
      const canvasEl = document.getElementById("modal-map-canvas");
      const ctx = canvasEl.getContext("2d");

      /* GỐC: Các biến trạng thái phục vụ việc kéo thả di chuyển nhãn dán
      let isDragging = false;
      let draggedLabelIndex = -1;
      let dragOffsetX = 0;
      let dragOffsetY = 0;
      let dragHasMoved = false;
      let clickStartMouseX = 0;
      let clickStartMouseY = 0;
      let clickTimer = null; // Tránh xung đột giữa click đơn (xóa/thêm) và click đúp (sửa vùng bao)
      */

      // CẢI TIẾN: Các biến trạng thái kéo thả di chuyển nhãn dán + kéo dãn (resize) vùng bao phòng
      let isDragging = false;
      let draggedLabelIndex = -1;
      let dragOffsetX = 0;
      let dragOffsetY = 0;
      let dragHasMoved = false;
      let clickStartMouseX = 0;
      let clickStartMouseY = 0;
      let clickTimer = null; // Tránh xung đột giữa click đơn (xóa/thêm) và click đúp (sửa vùng bao)

      let isResizing = false;
      let resizedLabelIndex = -1;
      let resizeStartMouseX = 0;
      let resizeStartMouseY = 0;
      let resizeStartW = 3.0;
      let resizeStartH = 2.5;

      let mapMetadata = {
        resolution: 0.05,
        width: 0,
        height: 0,
        originX: 0,
        originY: 0,
        loaded: false
      };

      let robotPose = { x: 0.0, y: 0.0, theta: 0.0 };
      const mapImage = new Image();
      let scale = 1.0;
      let animationFrameId = null;
      let pulseRadius = 14;
      let pulseGrowing = true;

      // ==========================================
      // BỔ SUNG: Nạp bộ nhớ đệm (cache) bản đồ & pose để hiển thị ngay lập tức không trễ
      // ==========================================
      const cachedMap = localStorage.getItem(`robot_map_cache_${robotId}`);
      if (cachedMap) {
        try {
          const cachedData = JSON.parse(cachedMap);
          mapMetadata.resolution = cachedData.resolution;
          mapMetadata.width = cachedData.width;
          mapMetadata.height = cachedData.height;
          mapMetadata.originX = cachedData.originX;
          mapMetadata.originY = cachedData.originY;
          
          scale = Math.max(2, Math.round(920 / cachedData.width));
          canvasEl.width = cachedData.width * scale;
          canvasEl.height = cachedData.height * scale;
          
          if (sizeEl) {
            sizeEl.innerText = `Kích thước: ${cachedData.width}x${cachedData.height} px (Zoom ${scale}x) [Từ bộ nhớ đệm]`;
          }
          
          mapImage.src = "data:image/png;base64," + cachedData.image;
          mapImage.onload = () => {
            mapMetadata.loaded = true;
          };
          console.log(`[Cache] Đã nạp bản đồ thành công từ LocalStorage cho robot: ${robotId}`);
        } catch (e) {
          console.error("Lỗi nạp cache bản đồ:", e);
        }
      }

      const cachedPose = localStorage.getItem(`robot_pose_cache_${robotId}`);
      if (cachedPose) {
        try {
          const cachedData = JSON.parse(cachedPose);
          robotPose.x = cachedData.x;
          robotPose.y = cachedData.y;
          robotPose.theta = cachedData.theta;
          if (coordsEl) {
            coordsEl.innerText = `x: ${robotPose.x.toFixed(2)} m, y: ${robotPose.y.toFixed(2)} m, θ: ${(robotPose.theta * 180 / Math.PI).toFixed(1)}° [Từ bộ nhớ đệm]`;
          }
        } catch (e) {}
      }

      // Đọc các nhãn ghi chú đã lưu từ localStorage
      let savedLabels = JSON.parse(localStorage.getItem(`robot_map_labels_${robotId}`) || "[]");
      let isEditMode = false;

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const port = window.location.protocol === "https:" ? "8084" : "8083";
      const client = mqtt.connect(`${protocol}://broker.emqx.io:${port}/mqtt`);
      modal.dataset.mqttClient = "connected";

      client.on("connect", () => {
        if (statusEl) {
          statusEl.innerText = "Đã kết nối";
          statusEl.style.background = "#d1fae5";
          statusEl.style.color = "#065f46";
        }
        client.subscribe(`/robots/${robotId}/map`);
        client.subscribe(`/robots/${robotId}/pose`);
        
        // Gửi yêu cầu lấy bản đồ ngay lập tức
        try {
          client.publish(`/robots/${robotId}/map/request`, JSON.stringify({ request: "map" }));
          console.log(`Sent map request for robot: ${robotId}`);
        } catch (err) {
          console.error("Error publishing map request:", err);
        }
      });

      client.on("error", (err) => {
        console.error("MQTT Error:", err);
        if (statusEl) {
          statusEl.innerText = "Lỗi kết nối";
          statusEl.style.background = "#fee2e2";
          statusEl.style.color = "#991b1b";
        }
      });

      client.on("message", (topic, message) => {
        try {
          const payload = JSON.parse(message.toString());

          if (topic.endsWith("/map")) {
            mapMetadata.resolution = payload.resolution;
            mapMetadata.width = payload.width;
            mapMetadata.height = payload.height;
            mapMetadata.originX = payload.origin_x;
            mapMetadata.originY = payload.origin_y;

            // Tự động tính toán tỷ lệ phóng to (scale) bản đồ để hiển thị đẹp nhất
            scale = Math.max(2, Math.round(920 / payload.width));
            
            canvasEl.width = payload.width * scale;
            canvasEl.height = payload.height * scale;

            if (sizeEl) {
              sizeEl.innerText = `Kích thước: ${payload.width}x${payload.height} px (Zoom ${scale}x)`;
            }

            /* CODE CŨ:
            mapImage.src = "data:image/png;base64," + payload.image;
            mapImage.onload = () => {
              mapMetadata.loaded = true;
            };
            */
            // CODE MỚI:
            mapImage.src = "data:image/png;base64," + payload.image;
            mapImage.onload = () => {
              mapMetadata.loaded = true;
              try {
                localStorage.setItem(`robot_map_cache_${robotId}`, JSON.stringify({
                  resolution: payload.resolution,
                  width: payload.width,
                  height: payload.height,
                  originX: payload.origin_x,
                  originY: payload.origin_y,
                  image: payload.image
                }));
              } catch (err) {
                console.warn("Lỗi lưu cache bản đồ:", err);
              }
            };
          } 
          else if (topic.endsWith("/pose")) {
            robotPose.x = payload.x;
            robotPose.y = payload.y;
            robotPose.theta = payload.theta;

            /* CODE CŨ:
            if (coordsEl) {
              coordsEl.innerText = `x: ${payload.x.toFixed(2)} m, y: ${payload.y.toFixed(2)} m, θ: ${(payload.theta * 180 / Math.PI).toFixed(1)}°`;
            }
            */
            // CODE MỚI:
            if (coordsEl) {
              coordsEl.innerText = `x: ${payload.x.toFixed(2)} m, y: ${payload.y.toFixed(2)} m, θ: ${(payload.theta * 180 / Math.PI).toFixed(1)}°`;
            }
            try {
              localStorage.setItem(`robot_pose_cache_${robotId}`, JSON.stringify(robotPose));
            } catch (err) {}
          }
        } catch (e) {
          console.error("Error parsing MQTT msg:", e);
        }
      });

      function worldToPixel(worldX, worldY) {
        if (!mapMetadata.loaded) return { x: 0, y: 0 };
        const px = (worldX - mapMetadata.originX) / mapMetadata.resolution;
        const py = mapMetadata.height - ((worldY - mapMetadata.originY) / mapMetadata.resolution);
        return { x: px * scale, y: py * scale };
      }

      function drawScene() {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

        // 1. Vẽ bản đồ (tắt làm mịn để giữ nét rõ ràng sắc nét khi zoom)
        if (mapMetadata.loaded) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(mapImage, 0, 0, canvasEl.width, canvasEl.height);
        }

        // 1.5. Vẽ các nhãn ghi chú đã lưu lên bản đồ (Tự động tính toán khoảng cách đến robot)
        if (mapMetadata.loaded) {
          let closestLabel = null;
          let minDistance = Infinity;
          if (savedLabels.length > 0) {
            /* GỐC: Tính khoảng cách cho mọi nhãn
            savedLabels.forEach((lbl) => {
              const dist = Math.hypot(robotPose.x - lbl.x, robotPose.y - lbl.y);
              if (dist < minDistance) {
                minDistance = dist;
                closestLabel = lbl;
              }
            });
            */

            // CẢI TIẾN: Xác định phòng gần nhất dựa trên việc robot đi vào vùng chữ nhật (Bounding Box)
            savedLabels.forEach((lbl) => {
              if (!lbl.text.toLowerCase().includes("phòng")) return;

              const w = lbl.w || 3.0; // chiều rộng mặc định 3m
              const h = lbl.h || 2.5; // chiều cao mặc định 2.5m
              const dx = Math.abs(robotPose.x - lbl.x);
              const dy = Math.abs(robotPose.y - lbl.y);

              if (dx <= w / 2 && dy <= h / 2) {
                const dist = Math.hypot(robotPose.x - lbl.x, robotPose.y - lbl.y);
                if (dist < minDistance) {
                  minDistance = dist;
                  closestLabel = lbl;
                }
              }
            });
          }
          const threshold = 1.5;

          /* GỐC: Nhãn dán nhỏ (11px)
          savedLabels.forEach((lbl) => {
            const pixelCoords = worldToPixel(lbl.x, lbl.y);
            
            ctx.font = "bold 11px Arial";
            const textWidth = ctx.measureText(lbl.text).width;
            const badgeWidth = textWidth + 12;
            const badgeHeight = 18;
            
            const isClosest = closestLabel && closestLabel.text === lbl.text && minDistance <= threshold;
            
            // Vẽ khung nền nhãn (Màu xanh ngọc lục bảo nếu robot đang ở gần)
            ctx.fillStyle = isClosest ? "rgba(16, 185, 129, 0.95)" : "rgba(15, 23, 42, 0.85)";
            ctx.beginPath();
            ctx.roundRect(pixelCoords.x - badgeWidth / 2, pixelCoords.y - 20, badgeWidth, badgeHeight, 4);
            ctx.fill();
            
            // Vẽ mũi tên chỉ xuống
            ctx.beginPath();
            ctx.moveTo(pixelCoords.x - 4, pixelCoords.y - 2);
            ctx.lineTo(pixelCoords.x + 4, pixelCoords.y - 2);
            ctx.lineTo(pixelCoords.x, pixelCoords.y + 1);
            ctx.closePath();
            ctx.fill();

            // Vẽ chữ màu trắng
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(lbl.text, pixelCoords.x, pixelCoords.y - 11);
          });
          */

          /* GỐC: Chỉ vẽ các Vùng Bao Chữ Nhật của các phòng khi ở chế độ chỉnh sửa
          if (isEditMode) {
            savedLabels.forEach((lbl) => {
              if (!lbl.text.toLowerCase().includes("phòng")) return;

              const pixelCoords = worldToPixel(lbl.x, lbl.y);
              const rectWidth = (lbl.w || 3.0) / mapMetadata.resolution * scale;
              const rectHeight = (lbl.h || 2.5) / mapMetadata.resolution * scale;
              const isClosest = closestLabel && closestLabel.text === lbl.text;

              // Vẽ vùng phủ mờ nhẹ bên trong hình chữ nhật
              ctx.fillStyle = isClosest ? "rgba(16, 185, 129, 0.08)" : "rgba(37, 99, 235, 0.03)";
              ctx.fillRect(pixelCoords.x - rectWidth / 2, pixelCoords.y - rectHeight / 2, rectWidth, rectHeight);

              // Vẽ viền nét đứt
              ctx.strokeStyle = isClosest ? "rgba(16, 185, 129, 0.7)" : "rgba(37, 99, 235, 0.4)";
              ctx.lineWidth = 1.5;
              ctx.setLineDash([6, 4]);
              ctx.strokeRect(pixelCoords.x - rectWidth / 2, pixelCoords.y - rectHeight / 2, rectWidth, rectHeight);
              ctx.setLineDash([]);
            });
          }
          */

          // CẢI TIẾN: Vẽ các Vùng Bao Chữ Nhật của các phòng kèm tay nắm kéo dãn (resize handle) ở góc dưới-phải
          if (isEditMode) {
            savedLabels.forEach((lbl) => {
              if (!lbl.text.toLowerCase().includes("phòng")) return;

              const pixelCoords = worldToPixel(lbl.x, lbl.y);
              const rectWidth = (lbl.w || 3.0) / mapMetadata.resolution * scale;
              const rectHeight = (lbl.h || 2.5) / mapMetadata.resolution * scale;
              const isClosest = closestLabel && closestLabel.text === lbl.text;

              // Vẽ vùng phủ mờ nhẹ bên trong hình chữ nhật
              ctx.fillStyle = isClosest ? "rgba(16, 185, 129, 0.08)" : "rgba(37, 99, 235, 0.03)";
              ctx.fillRect(pixelCoords.x - rectWidth / 2, pixelCoords.y - rectHeight / 2, rectWidth, rectHeight);

              // Vẽ viền nét đứt
              ctx.strokeStyle = isClosest ? "rgba(16, 185, 129, 0.7)" : "rgba(37, 99, 235, 0.4)";
              ctx.lineWidth = 1.5;
              ctx.setLineDash([6, 4]);
              ctx.strokeRect(pixelCoords.x - rectWidth / 2, pixelCoords.y - rectHeight / 2, rectWidth, rectHeight);
              ctx.setLineDash([]);

              // Vẽ tay nắm kéo dãn hình tròn nổi bật ở góc dưới-phải
              const handleX = pixelCoords.x + rectWidth / 2;
              const handleY = pixelCoords.y + rectHeight / 2;
              ctx.beginPath();
              ctx.arc(handleX, handleY, 6, 0, 2 * Math.PI);
              ctx.fillStyle = isClosest ? "#10b981" : "#2563eb"; // Màu Emerald khi gần robot, Blue khi bình thường
              ctx.fill();
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 1.5;
              ctx.stroke();
            });
          }

          // CẢI TIẾN: Nhãn dán phòng to hơn, dễ nhìn hơn kiểu PUBG (Arial Black/Impact, in hoa), nhãn giường bé hơn (11px Arial)
          savedLabels.forEach((lbl) => {
            const pixelCoords = worldToPixel(lbl.x, lbl.y);
            const isRoom = lbl.text.toLowerCase().includes("phòng");
            
            let badgeWidth, badgeHeight, badgeYOffset, textYOffset, arrowYOffset, borderRadius, fontStyle, displayText;
            
            if (isRoom) {
              // Nhãn phòng: Kiểu chữ PUBG (Arial Black / Impact, In hoa, To rõ)
              fontStyle = "bold 15px 'Arial Black', Impact, sans-serif";
              displayText = lbl.text.toUpperCase();
              badgeHeight = 28;
              borderRadius = 6;
              badgeYOffset = -32; // Vẽ từ y - 32 đến y - 4
              textYOffset = -18;
              arrowYOffset = -4;
            } else {
              // Nhãn giường: Bé hơn (Arial, Chữ thường, Compact)
              fontStyle = "bold 11px Arial, sans-serif";
              displayText = lbl.text;
              badgeHeight = 18;
              borderRadius = 4;
              badgeYOffset = -20; // Vẽ từ y - 20 đến y - 2
              textYOffset = -11;
              arrowYOffset = -2;
            }
            
            ctx.font = fontStyle;
            const textWidth = ctx.measureText(displayText).width;
            badgeWidth = textWidth + (isRoom ? 20 : 12);
            
            const isClosest = closestLabel && closestLabel.text === lbl.text && minDistance <= threshold;
            
            // Vẽ khung nền nhãn (Màu xanh ngọc lục bảo nếu robot đang ở gần)
            ctx.fillStyle = isClosest ? "rgba(16, 185, 129, 0.95)" : "rgba(15, 23, 42, 0.85)";
            ctx.beginPath();
            ctx.roundRect(pixelCoords.x - badgeWidth / 2, pixelCoords.y + badgeYOffset, badgeWidth, badgeHeight, borderRadius);
            ctx.fill();
            
            // Vẽ mũi tên chỉ xuống (khớp kích thước từng loại)
            ctx.beginPath();
            if (isRoom) {
              ctx.moveTo(pixelCoords.x - 6, pixelCoords.y + arrowYOffset);
              ctx.lineTo(pixelCoords.x + 6, pixelCoords.y + arrowYOffset);
              ctx.lineTo(pixelCoords.x, pixelCoords.y + 2);
            } else {
              ctx.moveTo(pixelCoords.x - 4, pixelCoords.y + arrowYOffset);
              ctx.lineTo(pixelCoords.x + 4, pixelCoords.y + arrowYOffset);
              ctx.lineTo(pixelCoords.x, pixelCoords.y + 1);
            }
            ctx.closePath();
            ctx.fill();

            // Vẽ chữ màu trắng
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(displayText, pixelCoords.x, pixelCoords.y + textYOffset);
          });
        }

        // 2. Vẽ robot cùng hiệu ứng radar nhấp nháy chuyển động
        if (mapMetadata.loaded) {
          const pixelCoords = worldToPixel(robotPose.x, robotPose.y);

          // Cập nhật bán kính vòng quét radar
          if (pulseGrowing) {
            pulseRadius += 0.25;
            if (pulseRadius > 24) pulseGrowing = false;
          } else {
            pulseRadius -= 0.25;
            if (pulseRadius < 14) pulseGrowing = true;
          }

          // Vẽ vòng sóng radar lan tỏa bên ngoài
          ctx.beginPath();
          ctx.arc(pixelCoords.x, pixelCoords.y, pulseRadius, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(37, 99, 235, 0.2)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pixelCoords.x, pixelCoords.y, 14, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(37, 99, 235, 0.35)";
          ctx.fill();

          // Vẽ robot chính
          ctx.save();
          ctx.translate(pixelCoords.x, pixelCoords.y);
          ctx.rotate(-robotPose.theta); 

          // Thân robot
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, 2 * Math.PI);
          ctx.fillStyle = "#1e293b"; // Slate đậm
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();

          // Mũi tên định hướng công nghệ cao
          ctx.beginPath();
          ctx.moveTo(11, 0);
          ctx.lineTo(2, -5);
          ctx.lineTo(4, 0);
          ctx.lineTo(2, 5);
          ctx.closePath();
          ctx.fillStyle = "#60a5fa"; // Xanh dương sáng rực
          ctx.fill();

          ctx.restore();
        }
      }

      function updateProximity() {
        const proximityEl = document.getElementById("map-robot-proximity");
        const proximityNameEl = document.getElementById("proximity-label-name");
        if (!proximityEl || !proximityNameEl) return;

        if (!mapMetadata.loaded || savedLabels.length === 0) {
          proximityEl.style.display = "none";
          return;
        }

        let minDistance = Infinity;
        let closestLabel = null;

        /* GỐC: Tính khoảng cách cho mọi nhãn dán
        savedLabels.forEach((lbl) => {
          const dist = Math.hypot(robotPose.x - lbl.x, robotPose.y - lbl.y);
          if (dist < minDistance) {
            minDistance = dist;
            closestLabel = lbl;
          }
        });
        */

        // CẢI TIẾN: Chỉ nhận diện khi robot đi vào trong Vùng Bao Chữ Nhật (Bounding Box) của phòng bệnh
        savedLabels.forEach((lbl) => {
          if (!lbl.text.toLowerCase().includes("phòng")) return;

          const w = lbl.w || 3.0;
          const h = lbl.h || 2.5;
          const dx = Math.abs(robotPose.x - lbl.x);
          const dy = Math.abs(robotPose.y - lbl.y);

          if (dx <= w / 2 && dy <= h / 2) {
            const dist = Math.hypot(robotPose.x - lbl.x, robotPose.y - lbl.y);
            if (dist < minDistance) {
              minDistance = dist;
              closestLabel = lbl;
            }
          }
        });

        if (closestLabel) {
          /* GỐC: Hiển thị tên nhãn kèm khoảng cách mét
          proximityNameEl.innerText = `${closestLabel.text} (cách ${minDistance.toFixed(1)}m)`;
          */
          // CẢI TIẾN: Chỉ hiển thị tên nhãn phòng
          proximityNameEl.innerText = closestLabel.text;
          proximityEl.style.display = "inline";
        } else {
          proximityEl.style.display = "none";
        }
      }

      const animate = () => {
        drawScene();
        updateProximity();
        animationFrameId = requestAnimationFrame(animate);
      };
      animate();

      // Sự kiện tương tác thêm/xóa/di chuyển nhãn dán
      const editBtn = document.getElementById("btn-edit-labels");
      const indicatorEl = document.getElementById("label-edit-mode-indicator");

      /* GỐC: Sự kiện click nút Ghi chú nhãn
      if (editBtn) {
        editBtn.onclick = () => {
          isEditMode = !isEditMode;
          if (isEditMode) {
            editBtn.style.background = "#ef4444";
            editBtn.style.color = "#ffffff";
            editBtn.style.borderColor = "#ef4444";
            indicatorEl.style.display = "inline";
            canvasEl.style.cursor = "crosshair";
          } else {
            editBtn.style.background = "#ffffff";
            editBtn.style.color = "#475569";
            editBtn.style.borderColor = "#cbd5e1";
            indicatorEl.style.display = "none";
            canvasEl.style.cursor = "default";
          }
        };
      }
      */

      // CẢI TIẾN: Chuyển đổi trạng thái của nút cờ lê tròn ở góc phải trên
      if (editBtn) {
        editBtn.onclick = () => {
          isEditMode = !isEditMode;
          if (isEditMode) {
            editBtn.style.background = "#10b981"; // Màu Emerald khi active
            const img = editBtn.querySelector("img");
            if (img) img.style.filter = "brightness(0) invert(1)"; // Chuyển ảnh cờ lê sang màu trắng
            if (indicatorEl) indicatorEl.style.display = "inline-block";
            canvasEl.style.cursor = "crosshair";
          } else {
            editBtn.style.background = "#f1f5f9";
            const img = editBtn.querySelector("img");
            if (img) img.style.filter = "none"; // Trả lại màu gốc của cờ lê
            if (indicatorEl) indicatorEl.style.display = "none";
            canvasEl.style.cursor = "default";
          }
        };
      }

      /* GỐC: Click handler thêm/xóa nhãn dán
      canvasEl.onclick = (e) => {
        if (!mapMetadata.loaded) return;

        const rect = canvasEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Quy đổi tọa độ click trên canvas về pixel bản đồ gốc (chia cho tỷ lệ scale)
        const rawPx = clickX / scale;
        const rawPy = clickY / scale;

        // Quy đổi pixel bản đồ gốc về hệ tọa độ thực tế (meters) của ROS
        const worldX = rawPx * mapMetadata.resolution + mapMetadata.originX;
        const worldY = (mapMetadata.height - rawPy) * mapMetadata.resolution + mapMetadata.originY;

        if (isEditMode) {
          // CẢI TIẾN: Tăng bán kính nhận diện click nhãn to (25px) để người dùng dễ chọn
          const clickRadius = 25;
          const labelIndex = savedLabels.findIndex((lbl) => {
            const lblPixel = worldToPixel(lbl.x, lbl.y);
            const dist = Math.hypot(clickX - lblPixel.x, clickY - lblPixel.y);
            return dist < clickRadius;
          });

          if (labelIndex !== -1) {
            // Xóa nhãn
            if (confirm(`Bạn muốn xóa nhãn "${savedLabels[labelIndex].text}"?`)) {
              savedLabels.splice(labelIndex, 1);
              localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
            }
          } else {
            // Thêm nhãn mới
            const text = prompt("Nhập nội dung nhãn (ví dụ: Phòng 101, Giường 1):");
            if (text && text.trim()) {
              savedLabels.push({
                text: text.trim(),
                x: worldX,
                y: worldY
              });
              localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
            }
          }
        }
      };
      */

      /* GỐC: Hỗ trợ Kéo thả di chuyển nhãn + Click thêm/xóa nhãn
      canvasEl.onmousedown = (e) => {
        if (!mapMetadata.loaded || !isEditMode) return;

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Bán kính click nhận diện nhãn (25px cho phòng to, 15px cho giường nhỏ)
        const labelIndex = savedLabels.findIndex((lbl) => {
          const isRoom = lbl.text.toLowerCase().includes("phòng");
          const clickRadius = isRoom ? 25 : 15;
          const lblPixel = worldToPixel(lbl.x, lbl.y);
          const dist = Math.hypot(mouseX - lblPixel.x, mouseY - lblPixel.y);
          return dist < clickRadius;
        });

        if (labelIndex !== -1) {
          isDragging = true;
          draggedLabelIndex = labelIndex;
          const lblPixel = worldToPixel(savedLabels[labelIndex].x, savedLabels[labelIndex].y);
          dragOffsetX = mouseX - lblPixel.x;
          dragOffsetY = mouseY - lblPixel.y;
          dragHasMoved = false;
          canvasEl.style.cursor = "grabbing";
        } else {
          isDragging = false;
          draggedLabelIndex = -1;
          clickStartMouseX = mouseX;
          clickStartMouseY = mouseY;
        }
      };

      canvasEl.onmousemove = (e) => {
        if (!mapMetadata.loaded) return;

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isEditMode && !isDragging) {
          const hoverLabelIndex = savedLabels.findIndex((lbl) => {
            const isRoom = lbl.text.toLowerCase().includes("phòng");
            const clickRadius = isRoom ? 25 : 15;
            const lblPixel = worldToPixel(lbl.x, lbl.y);
            const dist = Math.hypot(mouseX - lblPixel.x, mouseY - lblPixel.y);
            return dist < clickRadius;
          });
          canvasEl.style.cursor = hoverLabelIndex !== -1 ? "grab" : "crosshair";
        }

        if (!isDragging || draggedLabelIndex === -1) return;

        const lblPixel = worldToPixel(savedLabels[draggedLabelIndex].x, savedLabels[draggedLabelIndex].y);
        const currentLabelX = mouseX - dragOffsetX;
        const currentLabelY = mouseY - dragOffsetY;

        if (Math.hypot(currentLabelX - (lblPixel.x - dragOffsetX), currentLabelY - (lblPixel.y - dragOffsetY)) > 4) {
          dragHasMoved = true;
        }

        const rawPx = currentLabelX / scale;
        const rawPy = currentLabelY / scale;
        savedLabels[draggedLabelIndex].x = rawPx * mapMetadata.resolution + mapMetadata.originX;
        savedLabels[draggedLabelIndex].y = (mapMetadata.height - rawPy) * mapMetadata.resolution + mapMetadata.originY;
      };

      const stopDragging = (e) => {
        if (!mapMetadata.loaded || !isEditMode) return;

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isDragging && draggedLabelIndex !== -1) {
          isDragging = false;
          canvasEl.style.cursor = "crosshair";

          if (dragHasMoved) {
            localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
            draggedLabelIndex = -1;
          } else {
            // Xem như click -> trì hoãn 250ms để xem có phải là double click không
            const idx = draggedLabelIndex;
            draggedLabelIndex = -1;

            if (clickTimer) {
              // Đây là double click! Hủy click đơn
              clearTimeout(clickTimer);
              clickTimer = null;
            } else {
              clickTimer = setTimeout(() => {
                clickTimer = null;
                // Thực hiện xóa nhãn
                if (confirm(`Bạn muốn xóa nhãn "${savedLabels[idx].text}"?`)) {
                  savedLabels.splice(idx, 1);
                  localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
                }
              }, 250); // Ngưỡng 250ms cho double click
            }
          }
        } else {
          // Click trên vùng trống -> trì hoãn 250ms để xem có phải là double click không
          if (Math.hypot(mouseX - clickStartMouseX, mouseY - clickStartMouseY) < 5) {
            const rawPx = mouseX / scale;
            const rawPy = mouseY / scale;
            const worldX = rawPx * mapMetadata.resolution + mapMetadata.originX;
            const worldY = (mapMetadata.height - rawPy) * mapMetadata.resolution + mapMetadata.originY;

            if (clickTimer) {
              clearTimeout(clickTimer);
              clickTimer = null;
            } else {
              clickTimer = setTimeout(() => {
                clickTimer = null;
                const text = prompt("Nhập nội dung nhãn (ví dụ: Phòng 101, Giường 1):");
                if (text && text.trim()) {
                  savedLabels.push({
                    text: text.trim(),
                    x: worldX,
                    y: worldY
                  });
                  localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
                }
              }, 250);
            }
          }
        }
      };

      canvasEl.onmouseup = stopDragging;
      canvasEl.onmouseleave = () => {
        if (isDragging) {
          isDragging = false;
          canvasEl.style.cursor = isEditMode ? "crosshair" : "default";
          localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
          draggedLabelIndex = -1;
        }
      };
      */

      // CẢI TIẾN: Hỗ trợ Kéo thả di chuyển nhãn + Click thêm/xóa nhãn + Kéo dãn (resize) vùng bao phòng
      canvasEl.onmousedown = (e) => {
        if (!mapMetadata.loaded || !isEditMode) return;

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 1. Kiểm tra xem có click trúng tay nắm kéo dãn (Resize handle) của phòng nào không
        let resizeIndex = -1;
        for (let i = 0; i < savedLabels.length; i++) {
          const lbl = savedLabels[i];
          if (!lbl.text.toLowerCase().includes("phòng")) continue;
          const lblPixel = worldToPixel(lbl.x, lbl.y);
          const rectWidth = (lbl.w || 3.0) / mapMetadata.resolution * scale;
          const rectHeight = (lbl.h || 2.5) / mapMetadata.resolution * scale;
          const handleX = lblPixel.x + rectWidth / 2;
          const handleY = lblPixel.y + rectHeight / 2;
          if (Math.hypot(mouseX - handleX, mouseY - handleY) <= 12) {
            resizeIndex = i;
            break;
          }
        }

        if (resizeIndex !== -1) {
          isResizing = true;
          resizedLabelIndex = resizeIndex;
          resizeStartMouseX = mouseX;
          resizeStartMouseY = mouseY;
          resizeStartW = savedLabels[resizeIndex].w || 3.0;
          resizeStartH = savedLabels[resizeIndex].h || 2.5;
          canvasEl.style.cursor = "se-resize";
          return;
        }

        // 2. Kiểm tra xem có click trúng nhãn dán nào để di chuyển hoặc xóa/sửa không
        const labelIndex = savedLabels.findIndex((lbl) => {
          const isRoom = lbl.text.toLowerCase().includes("phòng");
          const clickRadius = isRoom ? 25 : 15;
          const lblPixel = worldToPixel(lbl.x, lbl.y);
          const dist = Math.hypot(mouseX - lblPixel.x, mouseY - lblPixel.y);
          return dist < clickRadius;
        });

        if (labelIndex !== -1) {
          isDragging = true;
          draggedLabelIndex = labelIndex;
          const lblPixel = worldToPixel(savedLabels[labelIndex].x, savedLabels[labelIndex].y);
          dragOffsetX = mouseX - lblPixel.x;
          dragOffsetY = mouseY - lblPixel.y;
          dragHasMoved = false;
          canvasEl.style.cursor = "grabbing";
        } else {
          isDragging = false;
          draggedLabelIndex = -1;
          clickStartMouseX = mouseX;
          clickStartMouseY = mouseY;
        }
      };

      canvasEl.onmousemove = (e) => {
        if (!mapMetadata.loaded) return;

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Nếu đang trong chế độ kéo dãn vùng bao (resizing)
        if (isResizing && resizedLabelIndex !== -1) {
          canvasEl.style.cursor = "se-resize";
          const dx_pixels = mouseX - resizeStartMouseX;
          const dy_pixels = mouseY - resizeStartMouseY;

          // Quy đổi pixels sang meters thực tế của ROS
          const dx_meters = dx_pixels * mapMetadata.resolution / scale;
          const dy_meters = dy_pixels * mapMetadata.resolution / scale;

          // Tính toán kích thước mới (symmetrically từ tâm, do đó nhân 2)
          const newW = Math.max(0.5, resizeStartW + 2 * dx_meters);
          const newH = Math.max(0.5, resizeStartH + 2 * dy_meters);

          savedLabels[resizedLabelIndex].w = parseFloat(newW.toFixed(2));
          savedLabels[resizedLabelIndex].h = parseFloat(newH.toFixed(2));
          return;
        }

        if (isEditMode && !isDragging) {
          // Kiểm tra xem có đang rê chuột qua tay nắm kéo dãn nào không
          let hoverResizeIndex = -1;
          for (let i = 0; i < savedLabels.length; i++) {
            const lbl = savedLabels[i];
            if (!lbl.text.toLowerCase().includes("phòng")) continue;
            const lblPixel = worldToPixel(lbl.x, lbl.y);
            const rectWidth = (lbl.w || 3.0) / mapMetadata.resolution * scale;
            const rectHeight = (lbl.h || 2.5) / mapMetadata.resolution * scale;
            const handleX = lblPixel.x + rectWidth / 2;
            const handleY = lblPixel.y + rectHeight / 2;
            if (Math.hypot(mouseX - handleX, mouseY - handleY) <= 10) {
              hoverResizeIndex = i;
              break;
            }
          }

          if (hoverResizeIndex !== -1) {
            canvasEl.style.cursor = "se-resize";
          } else {
            const hoverLabelIndex = savedLabels.findIndex((lbl) => {
              const isRoom = lbl.text.toLowerCase().includes("phòng");
              const clickRadius = isRoom ? 25 : 15;
              const lblPixel = worldToPixel(lbl.x, lbl.y);
              const dist = Math.hypot(mouseX - lblPixel.x, mouseY - lblPixel.y);
              return dist < clickRadius;
            });
            canvasEl.style.cursor = hoverLabelIndex !== -1 ? "grab" : "crosshair";
          }
        }

        if (!isDragging || draggedLabelIndex === -1) return;

        const lblPixel = worldToPixel(savedLabels[draggedLabelIndex].x, savedLabels[draggedLabelIndex].y);
        const currentLabelX = mouseX - dragOffsetX;
        const currentLabelY = mouseY - dragOffsetY;

        if (Math.hypot(currentLabelX - (lblPixel.x - dragOffsetX), currentLabelY - (lblPixel.y - dragOffsetY)) > 4) {
          dragHasMoved = true;
        }

        const rawPx = currentLabelX / scale;
        const rawPy = currentLabelY / scale;
        savedLabels[draggedLabelIndex].x = rawPx * mapMetadata.resolution + mapMetadata.originX;
        savedLabels[draggedLabelIndex].y = (mapMetadata.height - rawPy) * mapMetadata.resolution + mapMetadata.originY;
      };

      const stopDragging = (e) => {
        if (!mapMetadata.loaded || !isEditMode) return;

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isResizing && resizedLabelIndex !== -1) {
          isResizing = false;
          localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
          resizedLabelIndex = -1;
          canvasEl.style.cursor = "crosshair";
          return;
        }

        if (isDragging && draggedLabelIndex !== -1) {
          isDragging = false;
          canvasEl.style.cursor = "crosshair";

          if (dragHasMoved) {
            localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
            draggedLabelIndex = -1;
          } else {
            // Xem như click -> trì hoãn 250ms để xem có phải là double click không
            const idx = draggedLabelIndex;
            draggedLabelIndex = -1;

            if (clickTimer) {
              // Đây là double click! Hủy click đơn
              clearTimeout(clickTimer);
              clickTimer = null;
            } else {
              clickTimer = setTimeout(() => {
                clickTimer = null;
                // Thực hiện xóa nhãn
                if (confirm(`Bạn muốn xóa nhãn "${savedLabels[idx].text}"?`)) {
                  savedLabels.splice(idx, 1);
                  localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
                }
              }, 250); // Ngưỡng 250ms cho double click
            }
          }
        } else {
          // Click trên vùng trống -> trì hoãn 250ms để xem có phải là double click không
          if (Math.hypot(mouseX - clickStartMouseX, mouseY - clickStartMouseY) < 5) {
            const rawPx = mouseX / scale;
            const rawPy = mouseY / scale;
            const worldX = rawPx * mapMetadata.resolution + mapMetadata.originX;
            const worldY = (mapMetadata.height - rawPy) * mapMetadata.resolution + mapMetadata.originY;

            if (clickTimer) {
              clearTimeout(clickTimer);
              clickTimer = null;
            } else {
              clickTimer = setTimeout(() => {
                clickTimer = null;
                const text = prompt("Nhập nội dung nhãn (ví dụ: Phòng 101, Giường 1):");
                if (text && text.trim()) {
                  savedLabels.push({
                    text: text.trim(),
                    x: worldX,
                    y: worldY
                  });
                  localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
                }
              }, 250);
            }
          }
        }
      };

      canvasEl.onmouseup = stopDragging;
      canvasEl.onmouseleave = () => {
        if (isDragging) {
          isDragging = false;
          canvasEl.style.cursor = isEditMode ? "crosshair" : "default";
          localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
          draggedLabelIndex = -1;
        }
        if (isResizing) {
          isResizing = false;
          canvasEl.style.cursor = isEditMode ? "crosshair" : "default";
          localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
          resizedLabelIndex = -1;
        }
      };

      // CẢI TIẾN: Hỗ trợ nhấp đúp (double-click) để nhập kích thước Bounding Box cho phòng
      canvasEl.ondblclick = (e) => {
        if (!mapMetadata.loaded || !isEditMode) return;

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Tìm nhãn dán phòng được nhấn đúp
        const clickRadius = 25;
        const labelIndex = savedLabels.findIndex((lbl) => {
          if (!lbl.text.toLowerCase().includes("phòng")) return false;
          const lblPixel = worldToPixel(lbl.x, lbl.y);
          const dist = Math.hypot(mouseX - lblPixel.x, mouseY - lblPixel.y);
          return dist < clickRadius;
        });

        if (labelIndex !== -1) {
          const lbl = savedLabels[labelIndex];
          const input = prompt(
            `Nhập kích thước vùng bao hình chữ nhật cho nhãn "${lbl.text}" (Chiều rộng x Chiều cao bằng mét, ví dụ: 3x2.5 hoặc 4x3):`, 
            `${lbl.w || 3.0}x${lbl.h || 2.5}`
          );
          if (input) {
            const parts = input.toLowerCase().split("x");
            if (parts.length === 2) {
              const w = parseFloat(parts[0]);
              const h = parseFloat(parts[1]);
              if (!isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
                lbl.w = w;
                lbl.h = h;
                localStorage.setItem(`robot_map_labels_${robotId}`, JSON.stringify(savedLabels));
                alert(`Đã cập nhật kích thước vùng bao phòng "${lbl.text}" thành ${w}m x ${h}m!`);
              } else {
                alert("Kích thước không hợp lệ! Vui lòng nhập số lớn hơn 0.");
              }
            } else {
              alert("Định dạng không hợp lệ! Vui lòng dùng định dạng: Chiều_rộng x Chiều_cao (ví dụ: 3x2.5)");
            }
          }
        }
      };

      const closeBtn = document.getElementById("close-robot-map-modal");
      const cleanUp = () => {
        try {
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
          client.end(true);
          console.log("MQTT Client connection closed on modal close.");
        } catch (err) {
          console.error("Error closing MQTT connection:", err);
        }
        modal.remove();
        // Refresh dashboard to display the latest position/proximity label from localStorage
        this.renderDashboard(this.robots, this.deliveryCommands, true);
      };

      closeBtn.onclick = cleanUp;
      modal.onclick = (e) => {
        if (e.target === modal) cleanUp();
      };
    };

    if (!window.mqtt) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/mqtt/dist/mqtt.min.js";
      script.onload = () => {
        startMqttConnection();
      };
      document.head.appendChild(script);
    } else {
      startMqttConnection();
    }
  }
}


export default new RobotController();
