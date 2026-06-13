// ============================================
// PATIENT SERVICE - CRUD bệnh nhân
// ============================================

import stateService from "./stateService.js";
import authService from "./authService.js";
import logService from "./logService.js";
import dbService from "./dbService.js";
const firebaseService = dbService;

import roomService from "./roomService.js";
class PatientService {
  getNowForHistory() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  findMatchingValue(source, keyPattern, valueFilter = null, visited = new Set()) {
    if (!source || typeof source !== "object" || visited.has(source)) {
      return "";
    }
    visited.add(source);

    for (const [key, value] of Object.entries(source)) {
      if (keyPattern.test(String(key))) {
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!valueFilter || valueFilter(trimmed)) {
            return trimmed;
          }
        } else if (typeof value === "number") {
          return String(value);
        } else if (value && typeof value === "object") {
          const nested = this.findMatchingValue(value, keyPattern, valueFilter, visited);
          if (nested) return nested;
        }
      }
    }

    for (const value of Object.values(source)) {
      if (value && typeof value === "object") {
        const nested = this.findMatchingValue(value, keyPattern, valueFilter, visited);
        if (nested) return nested;
      }
    }

    return "";
  }

  /** Sau xuất viện: chỉ sửa 1 bản ghi trong state — không gọi getDocs toàn collection Patients */
  applyDischargeToLocalState(id, dischargeDate, dischargeCondition) {
    const state = stateService.getState();
    const cond = String(dischargeCondition || "").trim();
    const patients = (state.patients || []).map((p) => {
      if (String(p.id) !== String(id)) return p;
      return this.normalizePatientRecord({
        ...p,
        status: "discharged",
        dischargeDate,
        dischargeCondition: cond,
        dischargeNote: cond,
        tinhTrangXuatVien: cond,
      });
    });
    stateService.setState({ ...state, patients });
  }

  normalizePatientRecord(patient) {
    const dischargeDate =
      patient.dischargeDate ||
      patient.ngayXuatVien ||
      patient.discharge_date ||
      patient.dateOfDischarge ||
      patient.releasedAt ||
      this.findMatchingValue(patient, /(discharge|xuat|ra.?vien|release)/i, (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
      "";
    const dischargeCondition =
      patient.dischargeCondition ||
      patient.dischargeNote ||
      patient.dischargeStatusNote ||
      patient.tinhTrangXuatVien ||
      patient.conditionOnDischarge ||
      this.findMatchingValue(patient, /(discharge|xuat|ra.?vien|release|tinh.?trang|note|condition|status)/i, (value) => value.length > 0) ||
      "";

    return {
      ...patient,
      dischargeDate,
      dischargeCondition,
      height: patient.height || "",
      weight: patient.weight || "",
      bmi: patient.bmi || "",
      allergies: patient.allergies || "",
      medicalHistory: patient.medicalHistory || "",
      bloodType: patient.bloodType || "",
      icdCode: patient.icdCode || "",
      prescription: patient.prescription || "",
      diagnosis: patient.diagnosis || "",
      history: Array.isArray(patient.history) ? patient.history : []
    };
  }

  // Soft delete: chuyển status discharged thay vì xóa khỏi Firestore
  async deletePatient(id) {
    // Không cần kiểm tra quyền để đơn giản hóa
    const patient = this.getPatientById(id);
    if (!patient) {
      return { success: false, message: "Không tìm thấy bệnh nhân." };
    }

    // Có thể kiểm tra thêm điều kiện nếu cần
    const result = await firebaseService.updatePatientProfile(id, { status: "discharged" });
    if (!result.success) {
      return { success: false, message: "Không thể cập nhật trạng thái bệnh nhân." };
    }

    await this.syncPatientsFromCloud();
    return { success: true, message: "Đã xuất viện bệnh nhân." };
  }
  // Xuất viện (soft delete): chuyển trạng thái sang 'discharged' và cập nhật ngày xuất viện
  async dischargePatient(id, dischargeDate, dischargeCondition = "") {
    const patient = this.getPatientById(id);
    if (!patient) {
      return { success: false, message: "Không tìm thấy bệnh nhân." };
    }

    const history = Array.isArray(patient.history) ? [...patient.history] : [];
    history.push({
      time: this.getNowForHistory(),
      type: "discharge",
      detail: `Xuất viện. Tình trạng xuất viện: "${String(dischargeCondition || "").trim() || 'Bình thường'}"`,
      actor: authService.getCurrentUser() ? authService.getCurrentUser().fullName : "Hệ thống"
    });

    // Có thể kiểm tra thêm điều kiện nếu cần
    const result = await firebaseService.updatePatientProfile(id, {
      status: "discharged",
      dischargeDate,
      dischargeCondition: String(dischargeCondition || "").trim(),
      dischargeNote: String(dischargeCondition || "").trim(),
      tinhTrangXuatVien: String(dischargeCondition || "").trim(),
      history
    });
    if (!result.success) {
      return { success: false, message: "Không thể cập nhật trạng thái bệnh nhân." };
    }

    // Đồng bộ trạng thái giường: set occupied false và xóa patientName
    if (patient && patient.room && patient.bed) {
      await roomService.updateBedStatus(patient.room, patient.bed, false, "");
    }

    this.applyDischargeToLocalState(id, dischargeDate, dischargeCondition);
    return { success: true, message: "Đã xuất viện bệnh nhân." };
  }
  // Lấy danh sách bệnh nhân
  getPatients() {
    return stateService.getState().patients || [];
  }

  // Lọc bệnh nhân theo điều kiện
  filterPatients(filters = {}) {
    let patients = this.getPatients();

    // Lọc theo trạng thái
    if (filters.status && filters.status !== "all") {
      patients = patients.filter((p) => p.status === filters.status);
    }

    // Lọc theo phòng (không phân biệt hoa thường, partial match cho live search)
    if (filters.room && filters.room.trim()) {
      const room = filters.room.trim().toLowerCase();
      patients = patients.filter((p) => (p.room || "").toLowerCase().includes(room));
    }

    // Lọc theo tên bệnh nhân (không phân biệt hoa thường)
    if (filters.name && filters.name.trim()) {
      const nameQuery = filters.name.trim().toLowerCase();
      patients = patients.filter((p) => (p.name || "").toLowerCase().includes(nameQuery));
    }

    // Tìm kiếm toàn bộ text
    if (filters.search && filters.search.trim()) {
      const query = filters.search.toLowerCase();
      patients = patients.filter((p) => {
        const text = [p.name, p.room, p.bed, p.status, p.phone, p.citizenId, p.cccd, p.bhyt].join(" ").toLowerCase();
        return text.includes(query);
      });
    }

    return patients;
  }

  // Thêm bệnh nhân mới (luôn lưu lên Firestore, đồng bộ lại danh sách)
  async addPatient(patientData) {
    if (!authService.can("patients.create")) {
      logService.addSystemLog("patients", "Thêm bệnh nhân", "denied", "Không đủ quyền");
      return { success: false, message: "Không có quyền thêm bệnh nhân." };
    }

    const { name, room, bed, gender, dob, admissionDate, dischargeDate, doctor, phone, citizenId, bhyt, height, weight, bmi, allergies, medicalHistory, bloodType, icdCode, prescription, diagnosis } = patientData;
    if (!name || !room || !bed) {
      return { success: false, message: "Vui lòng nhập đủ thông tin." };
    }

    try {
      // Kiểm tra xem giường đã bị chiếm chưa (truy vấn DB thời gian thực)
      const roomsResult = await roomService.getRooms(true);
      const currentRoom = roomsResult.find(r => String(r.name).trim() === String(room).trim());
      if (currentRoom) {
        const targetBed = (currentRoom.beds || []).find(b => (typeof b === 'object' ? b.name : b) === bed);
        if (targetBed && targetBed.occupied) {
          return { 
            success: false, 
            message: `Giường "${bed}" tại "${room}" đã được đăng ký bởi bệnh nhân "${targetBed.patientName || 'khác'}". Vui lòng chọn giường khác.` 
          };
        }
      }

      // Cấu hình lịch sử ban đầu
      const history = [
        {
          time: this.getNowForHistory(),
          type: "admit",
          detail: `Nhập viện tại phòng ${room} - Giường ${bed}`,
          actor: authService.getCurrentUser() ? authService.getCurrentUser().fullName : "Hệ thống"
        }
      ];
      if (prescription && prescription.trim()) {
        history.push({
          time: this.getNowForHistory(),
          type: "prescription",
          detail: `Kê đơn thuốc ban đầu: "${prescription.trim()}"`,
          actor: authService.getCurrentUser() ? authService.getCurrentUser().fullName : "Hệ thống"
        });
      }
      if (diagnosis && diagnosis.trim()) {
        history.push({
          time: this.getNowForHistory(),
          type: "condition",
          detail: `Chẩn đoán ban đầu: "${diagnosis.trim()}"`,
          actor: authService.getCurrentUser() ? authService.getCurrentUser().fullName : "Hệ thống"
        });
      }

      // Luôn set status là 'admitted' khi thêm mới
      const profile = {
        name,
        room,
        bed,
        status: 'admitted',
        gender,
        dob,
        admissionDate,
        dischargeDate: dischargeDate || "",
        dischargeCondition: patientData.dischargeCondition || "",
        dischargeNote: patientData.dischargeCondition || "",
        tinhTrangXuatVien: patientData.dischargeCondition || "",
        doctor,
        phone: String(phone || "").trim(),
        citizenId: String(citizenId || "").trim(),
        bhyt: String(bhyt || "").trim(),
        height: height || "",
        weight: weight || "",
        bmi: bmi || "",
        allergies: allergies || "",
        medicalHistory: medicalHistory || "",
        bloodType: bloodType || "",
        icdCode: icdCode || "",
        prescription: prescription || "",
        diagnosis: diagnosis || "",
        history
      };

      const result = await firebaseService.addPatientProfile(profile);
      if (result.success) {
        // Cập nhật trạng thái giường: set occupied=true, patientName
        await roomService.updateBedStatus(room, bed, true, name);
        // Luôn đồng bộ lại danh sách từ Firestore để lấy đúng id
        await this.syncPatientsFromCloud();
        logService.addSystemLog("patients", "Thêm bệnh nhân", "success", `${name} - phòng ${room}`);
        return { success: true, message: "Đã thêm bệnh nhân." };
      } else {
        return { success: false, message: result.message || "Lỗi khi thêm bệnh nhân lên cloud" };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // Cập nhật bệnh nhân (luôn lưu lên Firestore, đồng bộ lại danh sách)
  async updatePatient(id, patientData) {
    if (!authService.can("patients.create")) {
      logService.addSystemLog("patients", "Sửa bệnh nhân", "denied", "Không đủ quyền");
      return { success: false, message: "Không có quyền sửa bệnh nhân." };
    }

    const patientBefore = this.getPatientById(id);
    if (!patientBefore) {
      return { success: false, message: "Không tìm thấy bệnh nhân." };
    }

    const { name, room, bed, gender, dob, admissionDate, dischargeDate, status, doctor, phone, citizenId, bhyt, height, weight, bmi, allergies, medicalHistory, bloodType, icdCode, prescription, diagnosis } = patientData;
    if (!name || !room || !bed) {
      return { success: false, message: "Vui lòng nhập đủ thông tin." };
    }

    try {
      // Nếu thay đổi phòng hoặc giường, cần kiểm tra xem giường đích đã bị chiếm chưa
      if (patientBefore.room !== room || patientBefore.bed !== bed) {
        const roomsResult = await roomService.getRooms(true);
        const currentRoom = roomsResult.find(r => String(r.name).trim() === String(room).trim());
        if (currentRoom) {
          const targetBed = (currentRoom.beds || []).find(b => (typeof b === 'object' ? b.name : b) === bed);
          if (targetBed && targetBed.occupied) {
            return { 
              success: false, 
              message: `Giường "${bed}" tại "${room}" đã được đăng ký bởi bệnh nhân "${targetBed.patientName || 'khác'}". Vui lòng chọn giường khác.` 
            };
          }
        }
      }

      const history = Array.isArray(patientBefore.history) ? [...patientBefore.history] : [];
      const actorName = authService.getCurrentUser() ? authService.getCurrentUser().fullName : "Hệ thống";
      const nowStr = this.getNowForHistory();

      // 1. Chuyển phòng / giường
      if (patientBefore.room !== room || patientBefore.bed !== bed) {
        history.push({
          time: nowStr,
          type: "transfer",
          detail: `Chuyển phòng/giường: từ Phòng ${patientBefore.room || '—'} - Giường ${patientBefore.bed || '—'} sang Phòng ${room} - Giường ${bed}`,
          actor: actorName
        });
      }

      // 2. Thay đổi đơn thuốc
      if ((patientBefore.prescription || "").trim() !== (prescription || "").trim()) {
        history.push({
          time: nowStr,
          type: "prescription",
          detail: `Cập nhật đơn thuốc: "${(prescription || "").trim() || "Trống"}" (Trước đó: "${(patientBefore.prescription || "").trim() || "Trống"}")`,
          actor: actorName
        });
      }

      // 3. Thay đổi chẩn đoán / Tình trạng
      if ((patientBefore.diagnosis || "").trim() !== (diagnosis || "").trim()) {
        history.push({
          time: nowStr,
          type: "condition",
          detail: `Thay đổi chẩn đoán: "${(diagnosis || "").trim() || "Trống"}" (Trước đó: "${(patientBefore.diagnosis || "").trim() || "Trống"}")`,
          actor: actorName
        });
      }

      const profile = {
        name,
        room,
        bed,
        status: status || 'admitted',
        gender,
        dob,
        admissionDate,
        dischargeDate: dischargeDate || "",
        dischargeCondition: patientData.dischargeCondition || patientBefore.dischargeCondition || "",
        dischargeNote: patientData.dischargeCondition || patientBefore.dischargeCondition || "",
        tinhTrangXuatVien: patientData.dischargeCondition || patientBefore.dischargeCondition || "",
        doctor,
        phone: String(phone || "").trim(),
        citizenId: String(citizenId || "").trim(),
        bhyt: String(bhyt || "").trim(),
        height: height || "",
        weight: weight || "",
        bmi: bmi || "",
        allergies: allergies || "",
        medicalHistory: medicalHistory || "",
        bloodType: bloodType || "",
        icdCode: icdCode || "",
        prescription: prescription || "",
        diagnosis: diagnosis || "",
        history
      };

      const result = await firebaseService.updatePatientProfile(id, profile);
      if (result.success) {
        // Nếu thay đổi phòng/giường, giải phóng giường cũ và đánh dấu giường mới
        if (patientBefore.room !== room || patientBefore.bed !== bed) {
          if (patientBefore.room && patientBefore.bed) {
            await roomService.updateBedStatus(patientBefore.room, patientBefore.bed, false, "");
          }
          await roomService.updateBedStatus(room, bed, true, name);
        } else if (patientBefore.name !== name) {
          // Cập nhật lại tên trên giường
          await roomService.updateBedStatus(room, bed, true, name);
        }

        // Đồng bộ lại danh sách
        await this.syncPatientsFromCloud();
        logService.addSystemLog("patients", "Sửa bệnh nhân", "success", `${name} - phòng ${room}`);
        return { success: true, message: "Đã cập nhật bệnh nhân." };
      } else {
        return { success: false, message: result.message || "Lỗi khi cập nhật bệnh nhân lên cloud" };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // Lấy bệnh nhân theo ID
  getPatientById(id) {
    return this.getPatients().find((p) => String(p.id) === String(id));
  }
  // Đồng bộ lại danh sách bệnh nhân từ Firestore về local state
  async syncPatientsFromCloud() {
    try {
      const patients = await firebaseService.getAllPatientsFromCloud();
      stateService.setState({
        ...stateService.getState(),
        patients: patients.map((patient) => this.normalizePatientRecord(patient)),
      });
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

export default new PatientService();
