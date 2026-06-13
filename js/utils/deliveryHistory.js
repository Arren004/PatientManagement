// Lấy lịch sử giao thuốc cho bệnh nhân
// patientId: id bệnh nhân (ưu tiên), nếu không có thì dùng tên
// Trả về mảng các lần giao thuốc (thời gian, loại thuốc, ghi chú, trạng thái...)
import dbService from "../services/dbService.js";
const firebaseService = dbService;

export async function getPatientDeliveryHistory(patient) {
  // Lấy toàn bộ deliveryCommands từ Firestore
  const res = await firebaseService.getCollection("deliveryCommands");
  const commands = res && res.success && Array.isArray(res.data) ? res.data : [];
  // Lọc các bin có liên quan đến bệnh nhân
  const result = [];
  for (const cmd of commands) {
    if (cmd.status === "open_lid") continue;
    if (!Array.isArray(cmd.bins)) continue;
    for (const bin of cmd.bins) {
      // So sánh theo id nếu có, nếu không thì so sánh theo tên
      if ((patient.id && bin.patientId && String(bin.patientId) === String(patient.id)) ||
          (bin.patientName && patient.name && bin.patientName === patient.name)) {
        result.push({
          createdAt: cmd.createdAt,
          ...bin,
          commandStatus: cmd.status || '',
        });
      }
    }
  }
  // Sắp xếp mới nhất lên đầu
  result.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
  return result;
}
