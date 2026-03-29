// ============================================
// LOGS VIEW - Render UI nhật ký
// ============================================

import { formatDeliveryStatus, formatUserRole, formatLogResult } from "../utils/formatter.js";
import authService from "../services/authService.js";

export function renderLogsView(
  container,
  deliveryLogs,
  systemLogs,
  activeLogTab,
  stats
) {
  const deliveryRows = deliveryLogs
    .map(
      (x) => `
      <tr>
        <td>${x.date}</td>
        <td>${x.patient}</td>
        <td>${x.nurse}</td>
        <td>${x.robot}</td>
        <td><span class="badge ${x.status}">${formatDeliveryStatus(x.status)}</span></td>
      </tr>
    `
    )
    .join("");

  const systemRows = systemLogs
    .map(
      (x) => `
      <tr>
        <td>${x.at}</td>
        <td>${x.actor}</td>
        <td>${formatUserRole(x.role)}</td>
        <td>${x.module}</td>
        <td>${x.action}</td>
        <td>${x.detail || "-"}</td>
        <td><span class="badge ${x.result}">${formatLogResult(x.result)}</span></td>
      </tr>
    `
    )
    .join("");

  container.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Nhật ký & thống kê</h2>
        <p>Theo dõi hiệu suất giao thuốc tự động</p>
      </div>
    </div>

    <div class="card tabs-row">
      <button class="ghost-btn ${activeLogTab === "delivery" ? "active-tab" : ""}" data-tab="delivery" type="button">Nhật ký giao thuốc</button>
      ${authService.can("logs.system.view") ? `<button class="ghost-btn ${activeLogTab === "system" ? "active-tab" : ""}" data-tab="system" type="button">Nhật ký hệ thống</button>` : ""}
    </div>

    <div class="card patient-toolbar-card">
      <div class="filter-group">
        <select id="log-result-filter">
          <option value="all">Tất cả kết quả</option>
          <option value="success">Thành công</option>
          <option value="failed">Thất bại</option>
          <option value="denied">Từ chối quyền</option>
        </select>
        ${activeLogTab === "system" ? `
          <select id="log-module-filter">
            <option value="all">Tất cả module</option>
            <option value="auth">auth</option>
            <option value="patients">patients</option>
            <option value="nurses">nurses</option>
            <option value="delivery">delivery</option>
            <option value="logs">logs</option>
            <option value="system">system</option>
          </select>
        ` : ""}
        <input id="log-date-filter" type="date" />
        <button id="apply-log-filter" class="ghost-btn" type="button"><i class="fa-solid fa-filter" aria-hidden="true"></i><span>Lọc</span></button>
        <button id="reset-log-filter" class="ghost-btn" type="button"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Đặt lại</span></button>
      </div>
    </div>

    <div class="grid-3">
      <div class="stat"><span>Tổng lượt giao</span><strong>${stats.total}</strong></div>
      <div class="stat"><span>Thành công</span><strong style="color:#10b981">${stats.success}</strong></div>
      <div class="stat"><span>Thất bại / Tỉ lệ thành công</span><strong style="color:${stats.failed > 0 ? "#ef4444" : "#2563eb"}">${stats.failed} / ${stats.rate}%</strong></div>
    </div>

    <div class="card table-wrap">
      <table>
        ${activeLogTab === "delivery" ? `
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Bệnh nhân</th>
              <th>Y tá</th>
              <th>Robot</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>${deliveryRows || "<tr><td colspan='5'>Không có dữ liệu.</td></tr>"}</tbody>
        ` : `
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thao tác</th>
              <th>Vai trò</th>
              <th>Module</th>
              <th>Hành động</th>
              <th>Chi tiết</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>${systemRows || "<tr><td colspan='7'>Không có dữ liệu.</td></tr>"}</tbody>
        `}
      </table>
    </div>
  `;
}
