// ============================================
// AUTH SERVICE - Quản lý xác thực và quyền hạn
// ============================================

import firebaseService from "./firebaseService.js";
import { ROLE_PERMISSIONS } from "../data/constants.js";

class AuthService {
  constructor() {
    this.currentUser = null;
    this.loginInFlight = false;
    this.usernameDomains = ["reto.com", "yourapp.local"];
    // Khi khởi động, đồng bộ với Firebase Auth
    setTimeout(() => this._initAuthSync(), 0);
  }

  _initAuthSync() {
    // Lắng nghe trạng thái đăng nhập của Firebase Auth
    firebaseService.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Lấy lại profile từ Firestore
        const profileResult = await firebaseService.getUserProfile(firebaseUser.uid);
        if (profileResult.success) {
          this.currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...profileResult.data,
            role: this.normalizeRole(profileResult.data.role),
          };
          localStorage.setItem("currentUser", JSON.stringify(this.currentUser));
        }
      } else {
        this.currentUser = null;
        localStorage.removeItem("currentUser");
      }
    });
  }

  normalizeRole(role) {
    const value = String(role || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

    if (["head_nurse", "headnurse", "head-nurse", "head_nurse_", "yta_truong", "y_ta_truong", "ytatruong", "yta_truong"].includes(value)) {
      return "head_nurse";
    }

    if (["nurse", "yta", "y_ta", "ytathuong", "y_ta_thuong"].includes(value)) {
      return "nurse";
    }

    return value || "nurse";
  }

  withTimeout(promise, ms, timeoutMessage) {
    return Promise.race([
      promise,
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: false, code: "timeout", error: timeoutMessage });
        }, ms);
      }),
    ]);
  }

  buildCandidateEmails(emailOrUsername) {
    if (emailOrUsername.includes("@")) {
      return [emailOrUsername];
    }

    return this.usernameDomains.map((domain) => `${emailOrUsername}@${domain}`);
  }

  // Đăng nhập với Firebase Auth
  // email format: username@yourapp.local hoặc email thực
  async login(emailOrUsername, password) {
    if (this.loginInFlight) {
      return {
        success: false,
        message: "Dang xu ly dang nhap. Vui long cho...",
      };
    }

    this.loginInFlight = true;
    try {
      console.log("[Auth] Login attempt with:", emailOrUsername);

      const candidateEmails = this.buildCandidateEmails(emailOrUsername.trim());
      console.log("[Auth] Candidate emails:", candidateEmails);

      let signInResult = null;
      for (const email of candidateEmails) {
        console.log("[Auth] Trying sign in with:", email);
        signInResult = await this.withTimeout(
          firebaseService.signIn(email, password),
          9000,
          "Dang nhap qua cham. Kiem tra mang va thu lai."
        );

        if (signInResult.success) {
          break;
        }

        // Nếu không phải lỗi thông tin đăng nhập, dừng sớm để trả đúng lỗi thực.
        if (signInResult.code && !["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(signInResult.code)) {
          break;
        }
      }

      if (!signInResult.success) {
        console.error("[Auth] Sign in failed:", signInResult.error);
        const timeoutMessage = signInResult.code === "timeout" ? signInResult.error : "Sai tài khoản hoặc mật khẩu.";
        return {
          success: false,
          message: timeoutMessage,
          error: signInResult.error,
        };
      }

      // Lấy profile từ Firestore
      const uid = signInResult.user.uid;
      console.log("[Auth] Fetching profile for UID:", uid);
      const profileResult = await this.withTimeout(
        firebaseService.getUserProfile(uid),
        6000,
        "Doc profile qua cham. Kiem tra Firestore Rules hoac mang."
      );
      if (!profileResult.success) {
        console.error("[Auth] Profile fetch failed:", profileResult.error);
        if (profileResult.code === "timeout") {
          return {
            success: false,
            message: profileResult.error,
            error: profileResult.error,
          };
        }
        if (profileResult.code === "permission-denied") {
          return {
            success: false,
            message: "Không có quyền truy cập thông tin người dùng.",
            error: profileResult.error,
          };
        }

        return {
          success: false,
          message: "Không tìm thấy thông tin người dùng.",
          error: profileResult.error,
        };
      }

      // Kiểm tra status active/inactive
      const profile = profileResult.data;
      if (profile.status === "inactive") {
        console.warn("[Auth] User is inactive:", uid);
        return {
          success: false,
          message: "Tài khoản này đã bị vô hiệu hóa.",
        };
      }

      // Lưu user hiện tại
      this.currentUser = {
        uid,
        email: signInResult.user.email,
        ...profile,
        role: this.normalizeRole(profile.role),
      };
      localStorage.setItem("currentUser", JSON.stringify(this.currentUser));
      // KHÔNG ghi log đăng nhập lên Firestore nữa
      console.log("[Auth] Login success! User:", this.currentUser);
      return { success: true, user: this.currentUser };
    } finally {
      this.loginInFlight = false;
    }
  }

  // Đăng xuất
  async logout() {
    const result = await firebaseService.signOut();
    if (result.success) {
      this.currentUser = null;
      localStorage.removeItem("currentUser");
    }
    return result;
  }

  // Lấy user hiện tại
  getCurrentUser() {
    return this.currentUser;
  }

  // Kiểm tra người dùng đã đăng nhập chưa
  isLoggedIn() {
    return this.currentUser !== null;
  }

  // Kiểm tra quyền hạn
  can(permission) {
    if (!this.currentUser) return false;
    const normalizedRole = this.normalizeRole(this.currentUser.role);
    const granted = ROLE_PERMISSIONS[normalizedRole] || [];
    return granted.includes(permission);
  }

  // Kiểm tra có phải y tá trưởng không
  isHeadNurse() {
    return this.currentUser && this.normalizeRole(this.currentUser.role) === "head_nurse";
  }

  // Lấy danh sách quyền của user
  getPermissions() {
    if (!this.currentUser) return [];
    const normalizedRole = this.normalizeRole(this.currentUser.role);
    return ROLE_PERMISSIONS[normalizedRole] || [];
  }

  // Lắng nghe thay đổi auth state
  onAuthStateChanged(callback) {
    return firebaseService.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        const profileResult = await firebaseService.getUserProfile(firebaseUser.uid);
        if (profileResult.success) {
          const profile = profileResult.data;
          if (profile.status === "inactive") {
            // Nếu user bị vô hiệu hóa, đăng xuất và clear session
            console.warn("[Auth] User is inactive on session restore:", firebaseUser.uid);
            await this.logout();
            callback(null);
            return;
          }
          this.currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...profile,
            role: this.normalizeRole(profile.role),
          };
          localStorage.setItem("currentUser", JSON.stringify(this.currentUser));
        } else {
          this.currentUser = null;
          localStorage.removeItem("currentUser");
        }
      } else {
        this.currentUser = null;
        localStorage.removeItem("currentUser");
      }
      callback(this.currentUser);
    });
  }
}

export default new AuthService();
