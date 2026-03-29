// ============================================
// HẰNG SỐ MENU VÀ QUYỀN HẠN
// ============================================

export const MENU_ITEMS = [
  { key: "patients", label: '<img src="image/patient.png" class="icon-img"> Bệnh nhân' },
  { key: "nurses", label: '<img src="image/nurse.png" class="icon-img"> Y tá' },
  { key: "robots", label: '<img src="image/robot.png" class="icon-img"> Robot' },
  { key: "delivery", label: '<img src="image/medicine.png" class="icon-img"> Giao thuốc' },
  { key: "logs", label: '<img src="image/log.png" class="icon-img"> Nhật ký & Thống kê' },
];

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
  ],
  nurse: [
    "patients.create",
    "delivery.edit",
    "delivery.start",
    "logs.export",
    "logs.system.view",
  ],
};

export const STORAGE_KEY = "smart-hospital-state";

export const DEFAULT_STATE = {
  deliveryBins: [
    { patientId: "", note: "" },
    { patientId: "", note: "" },
    { patientId: "", note: "" },
    { patientId: "", note: "" },
  ],
  robots: [
    { id: 1, name: "MedBot Alpha", online: true, battery: 85, floor: "2nd", task: "Delivering Room 205" },
    { id: 2, name: "MedBot Beta", online: true, battery: 42, floor: "3rd", task: "Idle - waiting" },
    { id: 3, name: "MedBot Gamma", online: false, battery: 95, floor: "1st", task: "Idle - charging" },
  ],
  systemLogs: [
    {
      id: 1,
      at: "2026-03-20 08:10",
      actor: "System",
      role: "system",
      module: "system",
      action: "Khởi tạo dữ liệu mẫu",
      result: "success",
      detail: "Tạo dữ liệu dashboard mặc định",
    },
  ],
};
