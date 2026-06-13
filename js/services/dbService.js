// ============================================
// DATABASE SERVICE - Bọc PouchDB & CouchDB LAN Sync (Offline-First)
// ============================================

import { db, auth } from "../db-config.js";

// Hàm băm mật khẩu SHA-256 đồng bộ bằng Web Crypto API
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Trả về chuỗi ISO theo giờ địa phương (bao gồm múi giờ e.g. +07:00)
function getLocalISOString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const tzo = -d.getTimezoneOffset();
  const dif = tzo >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}${dif}${pad(Math.floor(Math.abs(tzo) / 60))}:${pad(Math.abs(tzo) % 60)}`;
}

class DatabaseService {
  constructor() {
    this.userCollections = ["Users", "users"];
    this.tempPasswords = {}; // Lưu tạm mật khẩu y tá mới tạo trước khi ghi hồ sơ
    this.authListeners = [];

    // Tự động seed dữ liệu mẫu
    setTimeout(() => this.seedDefaultData(), 150);
  }

  // Khởi tạo dữ liệu mặc định (Admin, Y tá trưởng, và 2 Phòng mẫu)
  async seedDefaultData() {
    try {
      // Kiểm tra sự tồn tại của admin bằng db.get trực tiếp (tránh trễ index của PouchDB Find khi F5)
      let adminExists = false;
      try {
        await db.get('user_admin');
        adminExists = true;
      } catch {
        // Chưa tồn tại tài khoản admin
      }

      if (!adminExists) {
        console.log('[PouchDB Seeding] Không tìm thấy tài khoản admin, đang tạo dữ liệu mẫu...');
        const adminPassHash = await sha256('123456');
        const nursePassHash = await sha256('123456');

        const defaultDocs = [
          // Quản trị viên
          {
            _id: 'user_admin',
            type: 'user',
            username: 'admin',
            fullName: 'Quản trị viên',
            email: 'admin@reto.com',
            role: 'admin',
            status: 'active',
            passwordHash: adminPassHash,
            createdAt: getLocalISOString()
          },
          // Y tá trưởng
          {
            _id: 'user_headnurse',
            type: 'user',
            username: 'nurse',
            fullName: 'Y tá trưởng A',
            email: 'nurse@reto.com',
            role: 'head_nurse',
            status: 'active',
            passwordHash: nursePassHash,
            createdAt: getLocalISOString()
          },
         
         
        ];

        for (const doc of defaultDocs) {
          await db.put(doc);
        }
        console.log('[PouchDB Seeding] Đã nạp thành công dữ liệu mẫu (admin/nurse/rooms).');
      }

      // Tạo Design Document để hiển thị dạng bảng đẹp mắt trên CouchDB Fauxton
      const designDocId = '_design/views';
      let existingDesignDoc = null;
      try {
        existingDesignDoc = await db.get(designDocId);
      } catch (e) {
        // Chưa tồn tại
      }

      const targetViews = {
        patients: {
          map: "function (doc) { if (doc.type === 'patient') { emit(doc._id, { 'Tên': doc.name, 'Phòng': doc.room, 'Giường': doc.bed, 'Bác sĩ': doc.doctor, 'Trạng thái': doc.status }); } }"
        },
        users: {
          map: "function (doc) { if (doc.type === 'user') { emit(doc.username, { 'Tên đầy đủ': doc.fullName, 'Vai trò': doc.role, 'Trạng thái': doc.status }); } }"
        },
        rooms: {
          map: "function (doc) { if (doc.type === 'room') { emit(doc.name, { 'Số giường': doc.beds ? doc.beds.length : 0 }); } }"
        },
        systemLogs: {
          map: "function (doc) { if (doc.type === 'systemLog') { emit(doc.createdAt, { 'Loại': doc.logType, 'Thao tác': doc.action, 'Mô tả': doc.description }); } }"
        },
        deliveryCommands: {
          map: "function (doc) { if (doc.type === 'deliveryCommand') { emit(doc._id, { 'Robot': doc.robotId, 'Trạng thái': doc.status, 'Thời gian': doc.createdAt }); } }"
        },
        robots: {
          map: "function (doc) { if (doc.type === 'robot') { emit(doc._id, { 'Tên': doc.name, 'Pin': doc.battery, 'Trạng thái': doc.online ? 'Online' : 'Offline', 'Nhiệm vụ': doc.task, 'Vị trí': doc.location }); } }"
        }
      };

      let needUpdate = false;
      if (!existingDesignDoc) {
        needUpdate = true;
      } else {
        for (const viewName of Object.keys(targetViews)) {
          if (!existingDesignDoc.views || !existingDesignDoc.views[viewName]) {
            needUpdate = true;
            break;
          }
        }
      }

      if (needUpdate) {
        const designDoc = {
          _id: designDocId,
          views: targetViews,
          language: "javascript"
        };
        if (existingDesignDoc) {
          designDoc._rev = existingDesignDoc._rev;
        }
        await db.put(designDoc);
        console.log('[PouchDB Seeding] Đã cập nhật thành công Design Document Views (bao gồm deliveryCommands & robots) trên CouchDB.');
      }
    } catch (err) {
      console.error('[PouchDB Seeding] Lỗi khi tạo dữ liệu mẫu:', err);
    }
  }

  // Ánh xạ các collection cũ của Firestore sang "type" trong PouchDB
  mapCollectionToType(collectionName) {
    const name = String(collectionName).trim();
    if (name === "Users" || name === "users") return "user";
    if (name === "Patients") return "patient";
    if (name === "robots") return "robot";
    if (name === "deliveryCommands") return "deliveryCommand";
    if (name === "systemLogs") return "systemLog";
    if (name === "rooms") return "room";
    if (name === "loginHistory") return "loginHistory";
    return name;
  }

  // ============ THAO TÁC CƠ SỞ DỮ LIỆU CHUNG (GENERIC CRUD) ============

  async getCollection(collectionName) {
    try {
      const type = this.mapCollectionToType(collectionName);
      const result = await db.allDocs({
        include_docs: true
      });
      const data = result.rows
        .map(row => row.doc)
        .filter(doc => doc && doc.type === type)
        .map(doc => ({ ...doc, id: doc._id }));
      return { success: true, data };
    } catch (error) {
      console.error(`[PouchDB] Lỗi đọc collection ${collectionName}:`, error);
      return { success: false, code: "error", error: error.message };
    }
  }

  async getDocument(collectionName, docId) {
    try {
      const doc = await db.get(docId);
      return { success: true, data: { ...doc, id: doc._id } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setDocument(collectionName, docId, data) {
    try {
      const type = this.mapCollectionToType(collectionName);
      let existing = null;
      try {
        existing = await db.get(docId);
      } catch {
        // bỏ qua nếu tài liệu chưa tồn tại
      }

      const docData = {
        _id: docId,
        ...data,
        type: type,
        updatedAt: getLocalISOString()
      };

      if (existing) {
        docData._rev = existing._rev;
        docData.createdAt = existing.createdAt || getLocalISOString();
      } else {
        docData.createdAt = getLocalISOString();
      }

      await db.put(docData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateDocument(collectionName, docId, data) {
    try {
      const doc = await db.get(docId);
      const updated = {
        ...doc,
        ...data,
        updatedAt: getLocalISOString()
      };
      await db.put(updated);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async addDocument(collectionName, data) {
    try {
      const type = this.mapCollectionToType(collectionName);
      const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const docData = {
        _id: id,
        ...data,
        type: type,
        createdAt: getLocalISOString(),
        updatedAt: getLocalISOString()
      };
      await db.put(docData);
      return { success: true, id: id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============ THAO TÁC LẮNG NGHE REALTIME ============

  listenTypeRealtime(type, callback) {
    let localCache = [];
    let changes = null;
    let cancelled = false;

    // Nạp dữ liệu ban đầu bằng db.allDocs và lấy update_seq để làm điểm bắt đầu lắng nghe changes feed
    db.allDocs({
      include_docs: true,
      update_seq: true
    }).then(result => {
      if (cancelled) return;

      localCache = result.rows
        .map(row => row.doc)
        .filter(doc => doc && doc.type === type)
        .map(doc => ({ ...doc, id: doc._id }));
      callback([...localCache]);

      const seq = result.update_seq;
      changes = db.changes({
        since: seq,
        live: true,
        include_docs: true
      }).on('change', (change) => {
        if (change.doc && change.doc.type === type) {
          const doc = { ...change.doc, id: change.doc._id };
          const idx = localCache.findIndex(d => d._id === doc._id);

          if (change.doc._deleted) {
            if (idx >= 0) {
              localCache.splice(idx, 1);
            }
          } else {
            if (idx >= 0) {
              localCache[idx] = doc;
            } else {
              localCache.push(doc);
            }
          }

          // Tạo bản copy mới để tránh lỗi tham chiếu ngoài ý muốn
          callback([...localCache]);
        }
      });
    }).catch(err => {
      console.error(`[PouchDB] Lỗi nạp realtime ${type}:`, err);
    });

    // Trả về hàm hủy đăng ký (unsubscribe)
    return () => {
      cancelled = true;
      if (changes) {
        changes.cancel();
      }
    };
  }

  // ============ XÁC THỰC NGƯỜI DÙNG (AUTHENTICATION MOCK & LOCAL) ============

  async signIn(emailOrUsername, password) {
    try {
      console.log("[PouchDB Auth] Tiến hành đăng nhập:", emailOrUsername);
      const cleanInput = String(emailOrUsername).trim();
      const username = cleanInput.includes("@") ? cleanInput.split("@")[0] : cleanInput;

      // Tìm kiếm user document có username trùng khớp
      const result = await db.find({
        selector: { type: 'user', username: username }
      });

      if (result.docs.length === 0) {
        return { success: false, error: "Tài khoản không tồn tại.", code: "auth/user-not-found" };
      }

      const userDoc = result.docs[0];
      const inputHash = await sha256(password);

      if (userDoc.passwordHash !== inputHash) {
        return { success: false, error: "Sai tài khoản hoặc mật khẩu.", code: "auth/wrong-password" };
      }

      if (userDoc.status === "inactive" || userDoc.status === "dừng hoạt động") {
        return { success: false, error: "Tài khoản đã bị vô hiệu hóa.", code: "auth/user-disabled" };
      }

      // Đăng nhập thành công: gán vào auth.currentUser giả lập
      const mockFirebaseUser = {
        uid: userDoc._id,
        email: userDoc.email || `${username}@reto.com`
      };
      
      localStorage.setItem('auth_current_user', JSON.stringify(mockFirebaseUser));
      this.triggerAuthChange(mockFirebaseUser);
      return { success: true, user: mockFirebaseUser };
    } catch (error) {
      console.error("[PouchDB Auth] Lỗi đăng nhập:", error);
      return { success: false, error: error.message };
    }
  }

  async signOut() {
    localStorage.removeItem('auth_current_user');
    this.triggerAuthChange(null);
    return { success: true };
  }

  // Tạo user auth mới (dùng khi Admin thêm tài khoản y tá mới)
  async createAuthUser(email, password) {
    try {
      const uid = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Mã hóa mật khẩu lưu tạm chờ hàm createUserProfile gọi
      this.tempPasswords[uid] = await sha256(password);
      return { success: true, user: { uid, email } };
    } catch (error) {
      return { success: false, code: "auth/error", error: error.message };
    }
  }

  // Đổi mật khẩu
  async changeCurrentUserPassword(currentPassword, newPassword) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { success: false, code: "auth/no-current-user", error: "Chưa đăng nhập" };
      }

      const userDoc = await db.get(currentUser.uid);
      const currentHash = await sha256(currentPassword);

      if (userDoc.passwordHash !== currentHash) {
        return { success: false, code: "auth/wrong-password", error: "Mật khẩu hiện tại không đúng." };
      }

      userDoc.passwordHash = await sha256(newPassword);
      userDoc.updatedAt = getLocalISOString();
      await db.put(userDoc);

      return { success: true };
    } catch (error) {
      return { success: false, code: "error", error: error.message };
    }
  }

  // Đặt lại mật khẩu cho y tá khác (Thẩm quyền y tá trưởng)
  async resetUserPassword(uid, newPassword) {
    try {
      const userDoc = await db.get(uid);
      userDoc.passwordHash = await sha256(newPassword);
      userDoc.updatedAt = getLocalISOString();
      await db.put(userDoc);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Lắng nghe sự thay đổi trạng thái đăng nhập
  onAuthStateChanged(callback) {
    this.authListeners.push(callback);
    // Kích hoạt ngay lập tức với trạng thái hiện tại
    callback(auth.currentUser);

    return () => {
      this.authListeners = this.authListeners.filter(c => c !== callback);
    };
  }

  triggerAuthChange(user) {
    auth.currentUser = user;
    this.authListeners.forEach(callback => {
      try {
        callback(user);
      } catch (err) {
        // bỏ qua
      }
    });
  }

  // ============ NGƯỜI DÙNG & PROFILE (USERS) ============

  async findUserByUsername(username) {
    try {
      const result = await db.find({
        selector: { type: 'user', username: username }
      });
      if (result.docs.length > 0) {
        const found = result.docs[0];
        return { success: true, found: true, data: { id: found._id, ...found } };
      }
      return { success: true, found: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getUserProfile(uid) {
    try {
      const userDoc = await db.get(uid);
      if (userDoc && userDoc.type === 'user') {
        return { success: true, data: userDoc };
      }
      return { success: false, code: "profile-not-found", error: "Không tìm thấy hồ sơ người dùng." };
    } catch (error) {
      return { success: false, code: error.status === 404 ? "profile-not-found" : "error", error: error.message };
    }
  }

  async createUserProfile(uid, data) {
    // Đọc mật khẩu đã mã hóa lưu tạm
    const passwordHash = this.tempPasswords[uid] || "";
    delete this.tempPasswords[uid]; // Xóa sau khi dùng

    return this.setDocument("Users", uid, {
      ...data,
      passwordHash
    });
  }

  async updateUserProfile(uid, data) {
    return this.updateDocument("Users", uid, data);
  }

  // ============ BỆNH NHÂN (PATIENTS) ============

  async addPatientProfile(patientData) {
    return this.addDocument("Patients", patientData);
  }

  async updatePatientProfile(id, data) {
    return this.updateDocument("Patients", id, data);
  }

  async getAllPatientsFromCloud() {
    try {
      const result = await db.allDocs({
        include_docs: true
      });
      return result.rows
        .map(row => row.doc)
        .filter(doc => doc && doc.type === 'patient')
        .map(doc => ({ ...doc, id: doc._id }));
    } catch (error) {
      return [];
    }
  }

  // ============ LỆNH GIAO THUỐC (DELIVERY COMMANDS) ============

  async addMultiDeliveryCommand(binsData, robotId, nurseName = "Y tá") {
    return this.addDocument("deliveryCommands", {
      status: "delivering",
      bins: binsData,
      robotId: robotId,
      nurseName: nurseName
    });
  }

  listenDeliveryCommandsRealtime(callback) {
    return this.listenTypeRealtime("deliveryCommand", callback);
  }

  // ============ ROBOT ============

  listenRobotsRealtime(callback) {
    return this.listenTypeRealtime("robot", callback);
  }

  listenPatientsRealtime(callback) {
    return this.listenTypeRealtime("patient", callback);
  }

  listenRoomsRealtime(callback) {
    return this.listenTypeRealtime("room", callback);
  }

  // ============ NHẬT KÝ HỆ THỐNG (LOGS) ============

  async addSystemLogToCloud(log) {
    return this.addDocument("systemLogs", log);
  }

  async getSystemLogsFromCloud() {
    try {
      const result = await db.allDocs({
        include_docs: true
      });
      return result.rows
        .map(row => row.doc)
        .filter(doc => doc && doc.type === 'systemLog')
        .map(doc => ({ ...doc, id: doc._id }));
    } catch {
      return [];
    }
  }

  // Ghi nhật ký đăng nhập, giới hạn tối đa 20 bản ghi
  async logUserLogin(userId, username) {
    try {
      await this.addDocument("loginHistory", {
        userId,
        username,
        time: getLocalISOString()
      });

      // Lấy toàn bộ lịch sử đăng nhập của user này
      const result = await db.find({
        selector: { type: 'loginHistory', userId: userId }
      });

      // Sắp xếp giảm dần theo thời gian
      const docs = result.docs.sort((a, b) => new Date(b.time) - new Date(a.time));
      
      // Xóa các bản ghi cũ vượt quá 20
      if (docs.length > 20) {
        const toDelete = docs.slice(20);
        for (const docItem of toDelete) {
          await db.remove(docItem);
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

const dbService = new DatabaseService();
window.dbService = dbService; // Cho phép tương thích và kiểm tra

export async function addDocument(collectionName, data) {
  return dbService.addDocument(collectionName, data);
}

export default dbService;
