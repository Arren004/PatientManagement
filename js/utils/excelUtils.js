// ============================================
// EXCEL UTILS - Xử lý xuất Excel cho bệnh nhân
// ============================================

// Sử dụng SheetJS (xlsx) để xuất file Excel
// SheetJS CDN đã được nhúng trong index.html

/**
 * Xuất danh sách bệnh nhân ra file Excel
 * @param {Array} patients - Danh sách bệnh nhân
 * @param {Date} fromDate - Ngày bắt đầu lọc
 * @param {Date} toDate - Ngày kết thúc lọc
 */
export function exportPatientsToExcel(patients, fromDate, toDate) {
  // Lọc theo ngày nhập viện
  const filtered = patients.filter(p => {
    if (!p.admissionDate) return false;
    const date = new Date(p.admissionDate);
    return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  });

  // Chuyển đổi dữ liệu cho Excel
  const data = filtered.map(p => ({
    'Tên bệnh nhân': p.name,
    'Số phòng': p.room,
    'Số giường': p.bed,
    'Giới tính': p.gender || '',
    'Ngày sinh': p.dob || '',
    'Ngày nhập viện': p.admissionDate || '',
    'Ngày xuất viện': p.dischargeDate || '',
    'Trạng thái': p.status === 'admitted' ? 'Nhập viện' : 'Xuất viện',
  }));

  // Tạo worksheet và workbook
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bệnh nhân');

  // Xuất file
  const fileName = `DanhSachBenhNhan_${formatDateForFile(fromDate)}-${formatDateForFile(toDate)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

function formatDateForFile(date) {
  if (!date) return 'all';
  const d = new Date(date);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}
