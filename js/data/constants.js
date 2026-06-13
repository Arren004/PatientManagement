// ============================================
// HẰNG SỐ MENU VÀ QUYỀN HẠN
// ============================================

export const MENU_ITEMS = [
  { key: "patients", label: '<img src="image/patient.png" class="icon-img"> Bệnh nhân' },
  { key: "rooms", label: '<img src="image/bed.png" class="icon-img"> Phòng bệnh' },
  { key: "nurses", label: '<img src="image/nurse.png" class="icon-img"> Y tá' },
  { key: "robots", label: '<img src="image/robot.png" class="icon-img"> Robot' },
  { key: "delivery", label: '<img src="image/medicine.png" class="icon-img"> Giao thuốc' },
  { key: "dbexplorer", label: '<img src="image/log.png" class="icon-img"> Cơ sở dữ liệu' },
];

export const NURSE_DEPARTMENTS = [
  "Nội trú",
  "Cấp cứu",
  "ICU",
  "Ngoại",
  "Sản",
  "Nhi",
  "Phòng khám",
  "Khác",
];

export const NURSE_SHIFT_OPTIONS = ["Sáng", "Chiều", "Đêm"];

export const NURSE_SKILL_OPTIONS = [
  "Tiêm truyền",
  "ICU",
  "Cấp cứu",
  "Chăm sóc hậu phẫu",
  "Chăm sóc nhi",
  "Phục hồi chức năng",
];

export const NURSE_WORKING_STATUS_OPTIONS = [
  { value: "active", label: "Đang hoạt động" },
  { value: "temporary_leave", label: "Tạm nghỉ" },
];

export const EMPLOYEE_ID_PREFIX = "NV";

export const ROLE_PERMISSIONS = {
  head_nurse: [
    "patients.create",
    "nurses.create",
    "nurses.edit",
    "nurses.delete",
    "nurses.password",
    "delivery.edit",
    "delivery.start",
    "logs.export",
    "logs.system.view",
    "rooms.create",
    "rooms.edit_position"
  ],
  nurse: [
    "patients.create",
    "delivery.edit",
    "delivery.start",
    "logs.export",
    "logs.system.view"
  ],
  config: [],
};

export const STORAGE_KEY = "smart-hospital-state";

/** Số ngăn mặc định khi robot chưa cấu hình */
export const DEFAULT_ROBOT_COMPARTMENTS = 4;
export const MIN_ROBOT_COMPARTMENTS = 1;
export const MAX_ROBOT_COMPARTMENTS = 24;

/**
 * Giới hạn trên form Robot: v (m/s), W (rad/s). Chỉ ràng buộc UI + khi lưu Firestore;
 * phần cứng / ROS có thể giới hạn khác — chỉnh max/min tại đây một nơi.
 */
export const ROBOT_VELOCITY_V_BOUNDS = { min: 0, max: 6, step: 0.05 };
export const ROBOT_VELOCITY_W_BOUNDS = { min: -12, max: 12, step: 0.05 };

export function createEmptyDeliveryBin() {
  return { patientId: "", note: "", medicines: [] };
}

/**
 * Đọc số ngăn từ robot (Firestore). Hỗ trợ nhiều tên trường để tương thích.
 */
export function getRobotCompartmentCount(robot) {
  if (!robot || typeof robot !== "object") return DEFAULT_ROBOT_COMPARTMENTS;
  const raw = robot.compartmentCount ?? robot.slotCount ?? robot.binCount ?? robot.ngan;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ROBOT_COMPARTMENTS;
  const k = Math.floor(n);
  return Math.min(MAX_ROBOT_COMPARTMENTS, Math.max(MIN_ROBOT_COMPARTMENTS, k));
}

export const DEFAULT_STATE = {
  deliveryBins: Array.from({ length: DEFAULT_ROBOT_COMPARTMENTS }, () => createEmptyDeliveryBin()),
  /** Robot đang giữ khóa ngăn sau khi gửi lệnh (để robot khác vẫn chỉnh được nháp) */
  deliveryMissionRobotId: null,
  patients: [],
  rooms: [],
  robots: [],
  deliveryCommands: []
};
