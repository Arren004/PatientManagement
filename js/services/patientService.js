// ============================================
// PATIENT SERVICE - CRUD bệnh nhân
// ============================================

import stateService from "./stateService.js";
import authService from "./authService.js";
import logService from "./logService.js";
import firebaseService from "./firebaseService.js";

class PatientService {
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
    async dischargePatient(id, dischargeDate) {
      const patient = this.getPatientById(id);
      if (!patient) {
        return { success: false, message: "Không tìm thấy bệnh nhân." };
      }

      // Có thể kiểm tra thêm điều kiện nếu cần
      const result = await firebaseService.updatePatientProfile(id, { status: "discharged", dischargeDate });
      if (!result.success) {
        return { success: false, message: "Không thể cập nhật trạng thái bệnh nhân." };
      }

      await this.syncPatientsFromCloud();
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

    // Lọc theo phòng (chính xác)
    if (filters.room && filters.room.trim()) {
      const room = filters.room.trim();
      patients = patients.filter((p) => (p.room || "").trim() === room);
    }

    // Tìm kiếm toàn bộ text
    if (filters.search && filters.search.trim()) {
      const query = filters.search.toLowerCase();
      patients = patients.filter((p) => {
        const text = [p.name, p.room, p.bed, p.status].join(" ").toLowerCase();
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

    const { name, room, bed, gender, dob, admissionDate, dischargeDate } = patientData;
    if (!name || !room || !bed) {
      return { success: false, message: "Vui lòng nhập đủ thông tin." };
    }

    try {
      // Luôn set status là 'admitted' khi thêm mới
      const result = await firebaseService.addPatientProfile({
        name, room, bed, status: 'admitted', gender, dob, admissionDate, dischargeDate
      });
      if (result.success) {
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

  // Lấy bệnh nhân theo ID
  getPatientById(id) {
    return this.getPatients().find((p) => String(p.id) === String(id));
  }

  // Cập nhật bệnh nhân
  // updatePatient(id, patientData) {
  //   if (!authService.can("patients.create")) {
  //     logService.addSystemLog("patients", "Cập nhật bệnh nhân", "denied", "Không đủ quyền");
  //     return { success: false, message: "Không có quyền cập nhật bệnh nhân." };
  //   }

  //   const state = stateService.getState();
  //   const patientIndex = state.patients.findIndex((p) => p.id === id);

  //   if (patientIndex === -1) {
  //     return { success: false, message: "Không tìm thấy bệnh nhân." };
  //   }

  //   const { name, room, bed, status } = patientData;

  //   if (!name || !room || !bed) {
  //     return { success: false, message: "Vui lòng nhập đủ thông tin." };
  //   }

  //   state.patients[patientIndex] = {
  //     ...state.patients[patientIndex],
  //     name,
  //     room,
  //     bed,
  //     status,
  //   };

  //   stateService.saveState();
  //   logService.addSystemLog("patients", "Cập nhật bệnh nhân", "success", `${name} - phòng ${room}`);
  //   return { success: true, message: "Đã cập nhật bệnh nhân." };
  // }

  // Đồng bộ lại danh sách bệnh nhân từ Firestore về local state
  async syncPatientsFromCloud() {
    try {
      const patients = await firebaseService.getAllPatientsFromCloud();
      console.log("Patients from Firestore:", patients); // DEBUG LOG
      stateService.setState({ ...stateService.getState(), patients });
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

export default new PatientService();
