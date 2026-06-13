// ============================================
// NURSE SERVICE - CRUD y tá
// ============================================

import stateService from "./stateService.js";
import authService from "./authService.js";
import logService from "./logService.js";
import dbService from "./dbService.js";
const firebaseService = dbService;
import { EMPLOYEE_ID_PREFIX } from "../data/constants.js";

class NurseService {
  constructor() {
    this.nursesCache = [];
    this.defaultEmailDomain = "reto.com";
  }

  resolveAccountDisplay(entry, currentUser) {
    if (entry.email && String(entry.email).includes("@")) {
      return entry.email;
    }

    if (entry.username) {
      const username = String(entry.username).trim();
      if (username.includes("@")) {
        return username;
      }
      if (username.length > 0) {
        return `${username}@${this.defaultEmailDomain}`;
      }
    }

    if (currentUser && String(currentUser.uid) === String(entry.id) && currentUser.email) {
      return currentUser.email;
    }

    // Không hiển thị UID ở cột tài khoản để tránh khó đọc.
    return "(chua cap nhat email)";
  }

  // Lấy danh sách y tá
  getNurses() {
    return this.nursesCache;
  }

  // Đồng bộ danh sách y tá từ Firebase
  async syncNursesFromCloud() {
    const collections = ["Users", "users"];
    const errors = [];
    const currentUser = authService.getCurrentUser();

    for (const collectionName of collections) {
      const result = await firebaseService.getCollection(collectionName);
      if (result.success) {
        this.nursesCache = (result.data || []).map((entry) => ({
          id: entry.id,
          fullName: entry.fullName || entry.name || "(Chua co ten)",
          username: this.resolveAccountDisplay(entry, currentUser),
          employeeId: entry.employeeId || "",
          phone: entry.phone || "",
          avatar: entry.avatar || "",
          role: entry.role || "nurse",
          status: entry.status === "inactive" ? "dừng hoạt động" : (entry.status || "active"),
          workingStatus: entry.workingStatus || "active",
          department: entry.department || "",
          workArea: entry.workArea || "",
          shift: entry.shift || "",
          startDate: entry.startDate || "",
          skills: Array.isArray(entry.skills) ? entry.skills : [],
          experienceYears: entry.experienceYears || "",
          notes: entry.notes || "",
        }));
        return { success: true, data: this.nursesCache };
      }

      errors.push({ collectionName, code: result.code, error: result.error });
    }

    // Fallback local để không làm vỡ màn hình nếu Firebase chưa sẵn sàng
    const localUsers = stateService.getState().users || [];
    this.nursesCache = localUsers.map((entry) => ({ ...entry }));

    const permissionDenied = errors.find((entry) => entry.code === "permission-denied");
    if (permissionDenied) {
      return {
        success: false,
        message: `Khong du quyen doc danh sach y ta tu collection ${permissionDenied.collectionName}. Kiem tra Firestore Rules.`,
        data: this.nursesCache,
      };
    }

    return { success: false, message: "Khong the doc du lieu tu Firebase. Dang hien du lieu local.", data: this.nursesCache };
  }

  // Lọc y tá theo điều kiện
  filterNurses(filters = {}) {
    let nurses = this.getNurses();

    // Lọc theo vai trò
    if (filters.role && filters.role !== "all") {
      nurses = nurses.filter((u) => u.role === filters.role);
    }
    // Ẩn tài khoản admin khỏi danh sách
    nurses = nurses.filter((u) => u.role !== "admin");

    // Lọc theo trạng thái
    if (filters.status && filters.status !== "all") {
      if (filters.status === "inactive") {
        nurses = nurses.filter((u) => u.status === "dừng hoạt động" || u.status === "inactive");
      } else {
        nurses = nurses.filter((u) => u.status !== "dừng hoạt động" && u.status !== "inactive" && u.status === filters.status);
      }
    } else {
      // Nếu chọn tất cả trạng thái thì ẩn y tá ngừng hoạt động
      nurses = nurses.filter((u) => u.status !== "dừng hoạt động" && u.status !== "inactive");
    }

    // Tìm kiếm toàn bộ text
    if (filters.search && filters.search.trim()) {
      const query = filters.search.toLowerCase();
      nurses = nurses.filter((u) => {
        const text = [u.fullName, u.username, u.role, u.status].join(" ").toLowerCase();
        return text.includes(query);
      });
    }

    if (filters.skill && filters.skill !== "all") {
      nurses = nurses.filter((u) => Array.isArray(u.skills) && u.skills.includes(filters.skill));
    }

    if (filters.workingStatus && filters.workingStatus !== "all") {
      nurses = nurses.filter((u) => (u.workingStatus || "active") === filters.workingStatus);
    }

    return nurses;
  }

  // Lấy y tá theo ID
  getNurseById(id) {
    return this.getNurses().find((u) => String(u.id) === String(id));
  }

  // Thêm y tá mới: tạo Auth user + tạo profile Users/{uid}
  async addNurse(nurseData) {
    if (!authService.can("nurses.create")) {
      return { success: false, message: "Không có quyền thêm tài khoản y tá." };
    }

    const fullName = String(nurseData.fullName || "").trim();
    const rawUsername = String(nurseData.username || "").trim();
    const password = String(nurseData.password || "").trim();
    const phone = String(nurseData.phone || "").trim();
    const employeeId = String(nurseData.employeeId || "").trim();
    const avatar = String(nurseData.avatar || "").trim();
    const department = String(nurseData.department || "").trim();
    const workArea = String(nurseData.workArea || "").trim();
    const shift = String(nurseData.shift || "").trim();
    const startDate = String(nurseData.startDate || "").trim();
    const workingStatus = String(nurseData.workingStatus || "active").trim();
    const experienceYears = String(nurseData.experienceYears || "").trim();
    const notes = String(nurseData.notes || "").trim();
    const skills = Array.isArray(nurseData.skills)
      ? nurseData.skills.map((skill) => String(skill).trim()).filter(Boolean)
      : [];
    const safeEmployeeId = employeeId || `${EMPLOYEE_ID_PREFIX}${Date.now().toString().slice(-8)}`;

    if (!fullName || !rawUsername || !password) {
      return { success: false, message: "Vui lòng nhập đủ tên, tài khoản, mật khẩu." };
    }

    if (password.length < 6) {
      return { success: false, message: "Mật khẩu phải có ít nhất 6 ký tự." };
    }

    const email = rawUsername.includes("@") ? rawUsername : `${rawUsername}@${this.defaultEmailDomain}`;
    const username = email.split("@")[0];
    //Kiểm tra xem user đã tồn tại 
    const existed = await firebaseService.findUserByUsername(username);
    if (existed.success && existed.found) {
      return { success: false, message: "Tài khoản đã tồn tại." };
    }

    const createAuthResult = await firebaseService.createAuthUser(email, password);
    if (!createAuthResult.success) {
      if (createAuthResult.code === "auth/email-already-in-use") {
        return { success: false, message: "Email/tài khoản đã tồn tại trên hệ thống." };
      }
      return { success: false, message: "Không thể tạo tài khoản đăng nhập Firebase." };
    }

    const profileResult = await firebaseService.createUserProfile(createAuthResult.user.uid, {
      fullName,
      username,
      email,
      employeeId: safeEmployeeId,
      phone,
      avatar,
      role: nurseData.role === "head_nurse" ? "head_nurse" : "nurse",
      status: "active",
      workingStatus: workingStatus === "temporary_leave" ? "temporary_leave" : "active",
      department,
      workArea,
      shift,
      startDate,
      skills,
      experienceYears,
      notes,
    });

    if (!profileResult.success) {
      return { success: false, message: "Tạo tài khoản thành công nhưng lỗi tạo hồ sơ người dùng." };
    }

    await this.syncNursesFromCloud();
    logService.addSystemLog("nurses", "Thêm tài khoản y tá", "success", `Tạo tài khoản: ${email}`);
    return { success: true, message: "Đã thêm tài khoản y tá." };
  }


  // Soft delete: chuyển status inactive thay vì xóa Auth user.
  async deleteNurse(id) {
    if (!authService.can("nurses.delete")) {
      return { success: false, message: "Không có quyền xóa tài khoản y tá." };
    }

    const nurse = this.getNurseById(id);
    if (!nurse) {
      return { success: false, message: "Không tìm thấy y tá." };
    }

    if (nurse.role === "head_nurse") {
      return { success: false, message: "Không cho xóa trực tiếp tài khoản y tá trưởng." };
    }

    const result = await firebaseService.updateUserProfile(id, { status: "inactive" });
    if (!result.success) {
      return { success: false, message: "Không thể cập nhật trạng thái tài khoản." };
    }

    await this.syncNursesFromCloud();
    return { success: true, message: "Đã vô hiệu hóa tài khoản y tá.", deletedCurrentUser: false };
  }

  // Đặt lại mật khẩu cho y tá
  async resetNursePassword(id, newPassword) {
    if (!authService.can("nurses.password")) {
      return { success: false, message: "Bạn không có quyền đặt lại mật khẩu cho y tá." };
    }
    const nurse = this.getNurseById(id);
    if (!nurse) {
      return { success: false, message: "Không tìm thấy y tá." };
    }
    if (!newPassword || String(newPassword).length < 6) {
      return { success: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự." };
    }
    const result = await firebaseService.resetUserPassword(id, newPassword);
    if (!result.success) {
      return { success: false, message: result.error || "Không thể đặt lại mật khẩu." };
    }
    logService.addSystemLog("nurses", "Đặt lại mật khẩu y tá", "success", `Đặt lại mật khẩu cho tài khoản: ${nurse.username}`);
    return { success: true, message: "Đã đặt lại mật khẩu thành công." };
  }

}

export default new NurseService();
