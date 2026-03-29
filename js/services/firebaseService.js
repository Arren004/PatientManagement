// ============================================
// FIREBASE SERVICE - Bọc Firebase functions
// ============================================

import { app, auth, db } from "../firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

class FirebaseService {
        // Thêm log hệ thống lên Firestore
        async addSystemLogToCloud(log) {
          try {
            const docRef = await addDoc(collection(db, "systemLogs"), {
              ...log,
              createdAt: serverTimestamp(),
            });
            return { success: true, id: docRef.id };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }

        // Lấy toàn bộ log hệ thống từ Firestore
        async getSystemLogsFromCloud() {
          try {
            const q = query(collection(db, "systemLogs"));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          } catch (error) {
            return [];
          }
        }
      // Ghi lịch sử đăng nhập lên Firestore, giữ tối đa 20 bản ghi gần nhất cho mỗi user
      async logUserLogin(userId, username) {
        try {
          const loginHistoryRef = collection(db, "loginHistory");
          // Thêm bản ghi mới
          await addDoc(loginHistoryRef, {
            userId,
            username,
            time: new Date().toISOString(),
          });
          // Lấy các bản ghi cũ nhất (nếu > 20)
          const q = query(loginHistoryRef, where("userId", "==", userId));
          const snapshot = await getDocs(q);
          const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => new Date(b.time) - new Date(a.time));
          if (docs.length > 20) {
            const toDelete = docs.slice(20);
            for (const docItem of toDelete) {
              await deleteDoc(doc(db, "loginHistory", docItem.id));
            }
          }
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    // Cập nhật profile bệnh nhân
    async updatePatientProfile(id, data) {
      try {
        const docRef = doc(db, "Patients", id);
        await updateDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp(),
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  constructor() {
    this.userCollections = ["Users", "users"];
  }

  // ============ AUTH ============
  // Tạo user auth mới bằng email và password (dùng cho tạo tài khoản y tá mới)
  async createAuthUser(email, password) {
    const appName = `secondary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const secondaryApp = initializeApp(app.options, appName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, code: error.code, error: error.message };
    } finally {
      try {
        await signOut(secondaryAuth);
      } catch {
        // ignore
      }
      await deleteApp(secondaryApp);
    }
  }

  // Đăng nhập bằng email và password
  async signIn(email, password) {
    try {
      console.log("[Firebase] Signing in with:", email);
      // Ham dang nhap cua Firebase se tu dong kiem tra va chuyen doi email format neu can thiet
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("[Firebase] Sign in success! UID:", userCredential.user.uid);
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error("[Firebase] Sign in error:", error.code, error.message);
      return { success: false, error: error.message, code: error.code };
    }
  }

  // Đăng xuất
  async signOut() {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Lắng nghe thay đổi trạng thái auth
  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  }

  // ============ FIRESTORE - USERS ============

  async findUserByUsername(username) {
    const collections = ["Users", "users"];

    for (const collectionName of collections) {
      try {
        const q = query(collection(db, collectionName), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const found = querySnapshot.docs[0];
          return { success: true, found: true, data: { id: found.id, ...found.data() } };
        }
      } catch (error) {
        if (error.code === "permission-denied") {
          return { success: false, code: error.code, error: error.message };
        }
      }
    }

    return { success: true, found: false };
  }

  // Lấy profile user từ Firestore
  async getUserProfile(uid) {
    try {
      console.log("[Firebase] Getting user profile for UID:", uid);
      const errors = [];
      for (const collectionName of this.userCollections) {
        try {
          const docRef = doc(db, collectionName, uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            console.log(`[Firebase] Profile found in ${collectionName}:`, docSnap.data());
            return { success: true, data: docSnap.data() };
          }
        } catch (error) {
          if (error.code === "permission-denied") {
            console.warn(`[Firebase] Read ${collectionName}/${uid} denied by rules.`);
            return {
              success: false,
              code: "permission-denied",
              error: `Khong co quyen doc profile trong collection ${collectionName}`,
            };
          }

          errors.push({ collectionName, code: error.code, message: error.message });
          console.warn(`[Firebase] Read ${collectionName}/${uid} failed:`, error.code, error.message);
        }
      }

      console.warn("[Firebase] Profile not found for UID:", uid);
      if (errors.length) {
        const permissionDenied = errors.find((entry) => entry.code === "permission-denied");
        if (permissionDenied) {
          return {
            success: false,
            code: "permission-denied",
            error: `Khong co quyen doc profile trong collection ${permissionDenied.collectionName}`,
          };
        }
      }

      return { success: false, code: "profile-not-found", error: "User profile not found" };
    } catch (error) {
      console.error("[Firebase] Get profile error:", error.message);
      return { success: false, code: error.code, error: error.message };
    }
  }

  // Tạo profile user trong Firestore
  async createUserProfile(uid, data) {
    try {
      const docRef = doc(db, "Users", uid);
      await setDoc(docRef, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Cập nhật profile user
  async updateUserProfile(uid, data) {
    try {
      const docRef = doc(db, "Users", uid);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Thêm bệnh nhân mới lên Firestore
  async addPatientProfile(patientData) {
    try {
      const docRef = await addDoc(collection(db, "Patients"), patientData); // Đúng tên collection
      return { success: true, id: docRef.id };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Lấy toàn bộ danh sách bệnh nhân từ Firestore
  async getAllPatientsFromCloud() {
    try {
      const q = collection(db, "Patients");
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      return [];
    }
  }

  // ============ FIRESTORE - PATIENTS ============
  // TODO: Implement patients functionality in next phase

  // ============ FIRESTORE - DELIVERY COMMANDS ============
  // TODO: Implement delivery commands in next phase

  // ============ FIRESTORE - LOGS ============
  // TODO: Implement logs functionality in next phase

  // ============ FIRESTORE - GENERIC ============

  async getCollection(collectionName) {
    try {
      const q = query(collection(db, collectionName));
      const querySnapshot = await getDocs(q);
      const data = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, code: error.code, error: error.message };
    }
  }

  async getDocument(collectionName, docId) {
    try {
      const docRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { success: true, data: { id: docSnap.id, ...docSnap.data() } };
      } else {
        return { success: false, error: "Document not found" };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setDocument(collectionName, docId, data) {
    try {
      const docRef = doc(db, collectionName, docId);
      await setDoc(docRef, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateDocument(collectionName, docId, data) {
    try {
      const docRef = doc(db, collectionName, docId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

const firebaseService = new FirebaseService();
window.firebaseService = firebaseService;
export default firebaseService;
