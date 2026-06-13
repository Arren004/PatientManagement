// js/services/medicineService.js
// Service quản lý danh mục thuốc (CouchDB / PouchDB)
import dbService from './dbService.js';
const firebaseService = dbService;

const COLLECTION_NAME = 'medicines';

const DEFAULT_MEDICINES = [
  { name: "Paracetamol", dosage: "500mg", description: "Giảm đau, hạ sốt. Uống sau ăn." },
  { name: "Amoxicillin", dosage: "500mg", description: "Kháng sinh nhiễm khuẩn. Uống theo chỉ định bác sĩ." },
  { name: "Ibuprofen", dosage: "400mg", description: "Giảm đau, kháng viêm. Uống sau ăn no." },
  { name: "Vitamin C", dosage: "1000mg", description: "Tăng sức đề kháng. Uống sau khi ăn sáng." },
  { name: "Loperamide", dosage: "2mg", description: "Thuốc điều trị tiêu chảy cấp." },
  { name: "Salbutamol", dosage: "100mcg", description: "Hỗ trợ giãn phế quản trị hen suyễn." },
  { name: "Metformin", dosage: "850mg", description: "Thuốc điều trị tiểu đường tuýp 2." }
];

/**
 * Lấy danh sách tất cả các loại thuốc
 * @returns {Promise<Array>}
 */
export async function getAllMedicines() {
  const res = await firebaseService.getCollection(COLLECTION_NAME);
  if (res.success && Array.isArray(res.data)) {
    if (res.data.length === 0) {
      // Tự động seed danh mục thuốc mặc định nếu trống
      console.log('[MedicineService] Nạp danh mục thuốc mặc định...');
      for (const med of DEFAULT_MEDICINES) {
        await firebaseService.addDocument(COLLECTION_NAME, med);
      }
      const reFetch = await firebaseService.getCollection(COLLECTION_NAME);
      return reFetch.success && Array.isArray(reFetch.data) ? reFetch.data : [];
    }
    return res.data;
  }
  return [];
}

/**
 * Thêm loại thuốc mới
 * @param {object} medData
 * @returns {Promise<{success: boolean, id?: string, message?: string}>}
 */
export async function addMedicine(medData, optDosage = "") {
  let name, dosage, description;
  if (typeof medData === "object" && medData !== null) {
    name = String(medData.name || "").trim();
    dosage = String(medData.dosage || "").trim();
    description = String(medData.description || "").trim();
  } else {
    name = String(medData || "").trim();
    dosage = String(optDosage || "").trim();
    description = "";
  }
  
  if (!name) {
    return { success: false, message: "Tên thuốc không được để trống." };
  }

  const all = await getAllMedicines();
  const duplicate = all.some(med => 
    (med.name || "").trim().toLowerCase() === name.toLowerCase() && 
    (med.dosage || "").trim().toLowerCase() === dosage.toLowerCase()
  );
  
  if (duplicate) {
    return { success: false, message: `Thuốc "${name} (${dosage})" đã tồn tại.` };
  }

  const res = await firebaseService.addDocument(COLLECTION_NAME, {
    name,
    dosage,
    description
  });
  return { success: res.success, id: res.id, message: res.success ? "Thêm thuốc thành công!" : "Lỗi khi thêm thuốc." };
}

/**
 * Cập nhật thông tin thuốc
 * @param {string} id
 * @param {object} medData
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function updateMedicine(id, medData) {
  const name = String(medData.name || "").trim();
  const dosage = String(medData.dosage || "").trim();
  const description = String(medData.description || "").trim();

  if (!name) {
    return { success: false, message: "Tên thuốc không được để trống." };
  }

  const all = await getAllMedicines();
  const duplicate = all.some(med => 
    med.id !== id &&
    med.name.trim().toLowerCase() === name.toLowerCase() && 
    med.dosage.trim().toLowerCase() === dosage.toLowerCase()
  );

  if (duplicate) {
    return { success: false, message: `Thuốc "${name} (${dosage})" trùng tên với thuốc khác.` };
  }

  const res = await firebaseService.updatePatientProfile(id, {
    name,
    dosage,
    description
  }); // firebaseService.updatePatientProfile thực chất là gọi updateDocument(collection, id, data) nên dùng được chung.
  return { success: res.success, message: res.success ? "Cập nhật thuốc thành công!" : "Lỗi khi cập nhật." };
}

/**
 * Xóa thuốc khỏi danh mục
 * @param {string} id
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function deleteMedicine(id) {
  // PouchDB/CouchDB yêu cầu delete thông qua _id và _rev
  try {
    const db = (await import('../db-config.js')).db;
    const doc = await db.get(id);
    await db.remove(doc);
    return { success: true, message: "Đã xóa thuốc khỏi danh mục." };
  } catch (err) {
    return { success: false, message: err.message || "Lỗi khi xóa thuốc." };
  }
}
