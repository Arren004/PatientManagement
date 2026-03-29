// ============================================
// NURSE SERVICE - CRUD y tá
// ============================================

import stateService from "./stateService.js";
import authService from "./authService.js";
import logService from "./logService.js";
import firebaseService from "./firebaseService.js";

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
          role: entry.role || "nurse",
          status: entry.status === "inactive" ? "dừng hoạt động" : (entry.status || "active"),
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

    // Lọc theo trạng thái
    if (filters.status && filters.status !== "all") {
      if (filters.status === "inactive") {
        nurses = nurses.filter((u) => u.status === "dừng hoạt động");
      } else {
        nurses = nurses.filter((u) => u.status === filters.status);
      }
    }

    // Tìm kiếm toàn bộ text
    if (filters.search && filters.search.trim()) {
      const query = filters.search.toLowerCase();
      nurses = nurses.filter((u) => {
        const text = [u.fullName, u.username, u.role, u.status].join(" ").toLowerCase();
        return text.includes(query);
      });
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
      role: nurseData.role === "head_nurse" ? "head_nurse" : "nurse",
      status: "active",
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

}

export default new NurseService();
