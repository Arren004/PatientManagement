// ============================================
// FORMATTER - Định dạng dữ liệu hiển thị
// ============================================

export function capitalize(text) {
  if (!text) return "";
  return text[0].toUpperCase() + text.slice(1);
}

export function formatPatientStatus(status) {
  if (status === "admitted") return "Nhập viện";
  if (status === "discharged") return "Xuất viện";
  return capitalize(status);
}

export function formatDeliveryStatus(status) {
  if (status === "success") return "Thành công";
  if (status === "failed") return "Thất bại";
  return capitalize(status);
}

export function formatUserRole(role) {
  if (role === "head_nurse") return "Y tá trưởng";
  if (role === "nurse") return "Y tá";
  if (role === "system") return "Hệ thống";
  return role || "-";
}

export function formatUserStatus(status) {
  if (status === "active") return "Đang hoạt động";
  if (status === "inactive") return "Ngưng hoạt động";
  return capitalize(status);
}

export function formatWorkingStatus(status) {
  if (status === "active") return "Đang hoạt động";
  if (status === "temporary_leave") return "Tạm nghỉ";
  return capitalize(status);
}

export function formatLogResult(result) {
  if (result === "success") return "Thành công";
  if (result === "failed") return "Thất bại";
  if (result === "denied") return "Từ chối quyền";
  return capitalize(result);
}
