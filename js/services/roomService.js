// ============================================
// ROOM SERVICE - Firebase CRUD phòng & giường (Offline-First)
// ============================================

import dbService from "./dbService.js";
const firebaseService = dbService;

const ROOMS_COLLECTION = "rooms";

const roomService = {
  _cachedRooms: null,

  // Cập nhật vị trí cho một giường trong phòng
  async updateBedPosition(roomId, bedIdx, position) {
    const result = await firebaseService.getDocument(ROOMS_COLLECTION, roomId);
    if (!result.success) return { success: false, message: "Không tìm thấy phòng" };
    
    const room = result.data;
    const beds = room.beds || [];
    if (bedIdx < 0 || bedIdx >= beds.length) return { success: false, message: "Không tìm thấy giường" };
    
    beds[bedIdx] = { ...beds[bedIdx], position };
    
    const updateResult = await firebaseService.updateDocument(ROOMS_COLLECTION, roomId, { beds });
    if (!updateResult.success) return { success: false, message: "Không thể cập nhật vị trí giường" };
    
    this._cachedRooms = null; // Invalidate cache
    return { success: true };
  },

  async getRooms(forceRefresh = false) {
    if (this._cachedRooms && !forceRefresh) {
      return this._cachedRooms;
    }
    const result = await firebaseService.getCollection(ROOMS_COLLECTION);
    this._cachedRooms = result.success ? result.data : [];
    return this._cachedRooms;
  },

  async addRoom(name, beds = []) {
    await firebaseService.addDocument(ROOMS_COLLECTION, {
      name,
      beds: beds.length ? beds : []
    });
    this._cachedRooms = null; // Invalidate cache
  },

  async addBed(roomId) {
    const result = await firebaseService.getDocument(ROOMS_COLLECTION, roomId);
    if (!result.success) return;
    
    const room = result.data;
    const beds = room.beds || [];
    const bedName = `Giường ${beds.length + 1}`;
    beds.push({ name: bedName, occupied: false, patientName: "" });
    
    await firebaseService.updateDocument(ROOMS_COLLECTION, roomId, { beds });
    this._cachedRooms = null; // Invalidate cache
  },

  async removeBed(roomId) {
    const result = await firebaseService.getDocument(ROOMS_COLLECTION, roomId);
    if (!result.success) return;
    
    const room = result.data;
    let beds = room.beds || [];
    if (beds.length > 0) beds.pop();
    
    await firebaseService.updateDocument(ROOMS_COLLECTION, roomId, { beds });
    this._cachedRooms = null; // Invalidate cache
  },

  // Cập nhật trạng thái giường (occupied, patientName) cho 1 phòng
  async updateBedStatus(roomName, bedName, occupied, patientName = "") {
    const rn = String(roomName ?? "").trim();
    const result = await firebaseService.getCollection(ROOMS_COLLECTION);
    if (!result.success) return { success: false, message: "Không thể kết nối cơ sở dữ liệu" };
    
    const roomDoc = result.data.find(
      (room) => String(room.name ?? "").trim() === rn
    );
    if (!roomDoc) return { success: false, message: "Không tìm thấy phòng" };
    
    const beds = (roomDoc.beds || []).map(bed => {
      if ((typeof bed === 'object' ? bed.name : bed) === bedName) {
        return { ...bed, occupied, patientName };
      }
      return bed;
    });
    
    const updateResult = await firebaseService.updateDocument(ROOMS_COLLECTION, roomDoc.id, { beds });
    if (!updateResult.success) return { success: false, message: "Lỗi cập nhật trạng thái giường" };
    
    this._cachedRooms = null; // Invalidate cache
    return { success: true };
  }
};

window.roomService = roomService;
export default roomService;
