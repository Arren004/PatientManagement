// ============================================
// EXCEL UTILS - Xuất Excel đẹp cho bệnh nhân (ExcelJS)
// ============================================

// YÊU CẦU: Đã nhúng ExcelJS và FileSaver vào index.html
// <script src="https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>

import { getPatientDeliveryHistory } from "./deliveryHistory.js";

function filterPatientsByDate(patients, fromDate, toDate) {
  return patients.filter(p => {
    if (!p.admissionDate) return false;
    const date = new Date(p.admissionDate);
    return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  });
}

/**
 * Xuất danh sách bệnh nhân ra file Excel (đẹp, có style) bằng ExcelJS
 * @param {Array} patients - Danh sách bệnh nhân
 * @param {Date} fromDate - Ngày bắt đầu lọc
 * @param {Date} toDate - Ngày kết thúc lọc
 */
export async function exportPatientsToExcel(patients, fromDate, toDate, options = {}) {
  const { includeDelivery = true, includeDischarge = true } = options;
  const filtered = filterPatientsByDate(patients, fromDate, toDate);
  // Header và keys
  const columns = [
    { header: 'Tên bệnh nhân', key: 'name', width: 25 },
    { header: 'CCCD', key: 'citizenId', width: 16 },
    { header: 'BHYT', key: 'bhyt', width: 18 },
    { header: 'Số phòng', key: 'room', width: 10 },
    { header: 'Số giường', key: 'bed', width: 12 },
    { header: 'Giới tính', key: 'gender', width: 10 },
    { header: 'Ngày sinh', key: 'dob', width: 15 },
    { header: 'Ngày nhập viện', key: 'admissionDate', width: 18 },
    { header: 'Ngày xuất viện', key: 'dischargeDate', width: 18 },
    { header: 'Trạng thái', key: 'status', width: 12 },
  ];
  if (includeDelivery) columns.push({ header: 'Nhật ký giao thuốc (mới nhất 5)', key: 'deliveryLog', width: 60 });
  if (includeDischarge) columns.push({ header: 'Tình trạng khi xuất viện', key: 'dischargeCondition', width: 30 });

  // Map lại data cho đúng key
  // Lấy nhật ký giao thuốc cho mỗi bệnh nhân (giới hạn 5 bản ghi gần nhất)
  const excelData = await Promise.all(filtered.map(async p => {
    let deliveryLog = '';
    if (includeDelivery) {
      try {
        const history = await getPatientDeliveryHistory(p);
        if (Array.isArray(history) && history.length) {
          const items = history.slice(0, 5).map(it => {
            const date = it.createdAt && it.createdAt.seconds ? new Date(it.createdAt.seconds * 1000) : (it.createdAt ? new Date(it.createdAt) : null);
            const dateStr = date ? date.toLocaleString('vi-VN') : '';
            let medStr = '';
            if (Array.isArray(it.medicines)) medStr = it.medicines.map(m => (typeof m === 'string' ? m : (m.name || ''))).join(', ');
            else if (typeof it.medicines === 'string') medStr = it.medicines;
            return `${dateStr} — ${medStr}${it.note ? ' ('+it.note+')' : ''} ${it.commandStatus ? '['+it.commandStatus+']' : ''}`.trim();
          });
          deliveryLog = items.join('\n');
        }
      } catch (e) {
        deliveryLog = '';
      }
    }

    const dischargeCondition = includeDischarge ? (p.dischargeCondition || p.dischargeNote || p.tinhTrangXuatVien || p.conditionOnDischarge || '') : '';

    return {
      name: p.name,
      citizenId: p.citizenId || p.cccd || '',
      bhyt: p.bhyt || '',
      room: p.room,
      bed: p.bed,
      gender: p.gender || '',
      dob: p.dob || '',
      admissionDate: p.admissionDate || '',
      dischargeDate: p.dischargeDate || '',
      status: p.status === 'admitted' ? 'Nhập viện' : 'Xuất viện',
      deliveryLog,
      dischargeCondition,
    };
  }));

  // Tạo workbook và worksheet
  const workbook = new window.ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Bệnh nhân');
  worksheet.columns = columns;

  // Thêm dữ liệu
  worksheet.addRows(excelData);

  // Style header
  worksheet.getRow(1).eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F81BD' }, // Xanh dương
    };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });

  // Style từng dòng dữ liệu
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const isEven = i % 2 === 0;
    row.eachCell(cell => {
      cell.fill = isEven
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } // Xám nhạt
        : null;
      // Cho phép wrap text cho các cột như nhật ký giao thuốc
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
    });
  }

  // Xuất file
  const fileName = `DanhSachBenhNhan_${formatDateForFile(fromDate)}-${formatDateForFile(toDate)}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  window.saveAs(new Blob([buffer]), fileName);
}

function formatDateForFile(date) {
  if (!date) return 'all';
  const d = new Date(date);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

export async function exportDbToExcel(docs, selectedTypes, fromDate, toDate) {
  const workbook = new window.ExcelJS.Workbook();
  
  // Filter by date if applicable
  const start = fromDate ? new Date(fromDate) : null;
  const end = toDate ? new Date(toDate) : null;
  if (end) end.setHours(23, 59, 59, 999);

  const filteredDocs = docs.filter(doc => {
    if (!doc.createdAt) return true; // keep catalog items without dates
    const date = new Date(doc.createdAt);
    return (!start || date >= start) && (!end || date <= end);
  });

  // 1. Tab Patient
  if (selectedTypes.includes('patient')) {
    const patients = filteredDocs.filter(d => d.type === 'patient');
    const ws = workbook.addWorksheet('Bệnh nhân');
    ws.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã Bệnh Nhân', key: 'id', width: 25 },
      { header: 'Tên Bệnh Nhân', key: 'name', width: 25 },
      { header: 'Ngày Sinh', key: 'dob', width: 15 },
      { header: 'Giới Tính', key: 'gender', width: 12 },
      { header: 'Số Điện Thoại', key: 'phone', width: 15 },
      { header: 'Số Phòng', key: 'room', width: 12 },
      { header: 'Số Giường', key: 'bed', width: 12 },
      { header: 'Bác Sĩ Phụ Trách', key: 'doctor', width: 20 },
      { header: 'Trạng Thái', key: 'status', width: 15 },
      { header: 'Ngày Nhập Viện', key: 'admissionDate', width: 20 },
      { header: 'Ngày Xuất Viện', key: 'dischargeDate', width: 20 },
      { header: 'Tình Trạng Xuất Viện', key: 'dischargeCondition', width: 30 }
    ];
    patients.forEach((p, idx) => {
      ws.addRow({
        stt: idx + 1,
        id: p._id,
        name: p.name || '',
        dob: p.dob || '',
        gender: p.gender || '',
        phone: p.phone || '',
        room: p.room || '',
        bed: p.bed || '',
        doctor: p.doctor || '',
        status: p.status === 'admitted' ? 'Nhập viện' : (p.status === 'discharged' ? 'Xuất viện' : p.status),
        admissionDate: p.admissionDate || '',
        dischargeDate: p.dischargeDate || '',
        dischargeCondition: p.dischargeCondition || ''
      });
    });
    styleWorksheet(ws);
  }

  // 2. Tab Delivery Command
  if (selectedTypes.includes('deliveryCommand')) {
    const commands = filteredDocs.filter(d => d.type === 'deliveryCommand');
    const ws = workbook.addWorksheet('Lệnh giao thuốc');
    ws.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã Lệnh', key: 'id', width: 30 },
      { header: 'ID Robot', key: 'robotId', width: 12 },
      { header: 'Trạng Thái', key: 'status', width: 15 },
      { header: 'Người Thực Hiện', key: 'nurseName', width: 20 },
      { header: 'Thời Gian Tạo', key: 'createdAt', width: 25 },
      { header: 'Ngăn Kéo & Bệnh Nhân', key: 'binsInfo', width: 60 }
    ];
    commands.forEach((c, idx) => {
      let binsStr = '';
      if (Array.isArray(c.bins)) {
        binsStr = c.bins.map((bin, bIdx) => {
          if (!bin.patientName) return `Ngăn ${bIdx + 1}: Trống`;
          const medStr = Array.isArray(bin.medicines) 
            ? bin.medicines.map(m => `${m.name} (${m.dosage || ''}) x${m.quantity || 1}`).join(', ') 
            : '';
          return `Ngăn ${bIdx + 1}: ${bin.patientName} (Phòng ${bin.room || ''}) - Thuốc: [${medStr}]`;
        }).join('\n');
      }
      ws.addRow({
        stt: idx + 1,
        id: c._id,
        robotId: c.robotId || '',
        status: c.status === 'delivering' ? 'Đang giao' : (c.status === 'delivered' ? 'Đã hoàn thành' : c.status),
        nurseName: c.nurseName || 'Quản trị viên',
        createdAt: c.createdAt || '',
        binsInfo: binsStr
      });
    });
    styleWorksheet(ws);
  }

  // 3. Tab System Log
  if (selectedTypes.includes('systemLog')) {
    const logs = filteredDocs.filter(d => d.type === 'systemLog');
    const ws = workbook.addWorksheet('Nhật ký hệ thống');
    ws.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Thời Gian', key: 'timestamp', width: 25 },
      { header: 'Phân Loại', key: 'logType', width: 15 },
      { header: 'Thao Tác', key: 'action', width: 25 },
      { header: 'Kết Quả', key: 'result', width: 15 },
      { header: 'Chi Tiết', key: 'message', width: 50 }
    ];
    logs.forEach((l, idx) => {
      ws.addRow({
        stt: idx + 1,
        timestamp: l.timestamp || l.createdAt || '',
        logType: l.logType || '',
        action: l.action || '',
        result: l.result || '',
        message: l.message || ''
      });
    });
    styleWorksheet(ws);
  }

  // 4. Tab User
  if (selectedTypes.includes('user')) {
    const users = docs.filter(d => d.type === 'user');
    const ws = workbook.addWorksheet('Tài khoản y tá');
    ws.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Username', key: 'username', width: 15 },
      { header: 'Họ và tên', key: 'fullName', width: 25 },
      { header: 'Vai trò', key: 'role', width: 15 },
      { header: 'Số điện thoại', key: 'phone', width: 15 },
      { header: 'Phòng ban', key: 'department', width: 15 }
    ];
    users.forEach((u, idx) => {
      ws.addRow({
        stt: idx + 1,
        username: u.username || '',
        fullName: u.fullName || '',
        role: u.role === 'head_nurse' ? 'Y tá trưởng' : (u.role === 'admin' ? 'Quản trị viên' : 'Y tá'),
        phone: u.phone || '',
        department: u.department || ''
      });
    });
    styleWorksheet(ws);
  }

  // 5. Tab Robot
  if (selectedTypes.includes('robot')) {
    const robots = docs.filter(d => d.type === 'robot');
    const ws = workbook.addWorksheet('Thiết bị Robot');
    ws.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'ID Robot', key: 'id', width: 15 },
      { header: 'Tên Robot', key: 'name', width: 20 },
      { header: 'Địa Chỉ IP', key: 'ip', width: 20 },
      { header: 'Số Ngăn', key: 'compartments', width: 12 },
      { header: 'Trạng Thế', key: 'status', width: 15 }
    ];
    robots.forEach((r, idx) => {
      ws.addRow({
        stt: idx + 1,
        id: r.id || r._id || '',
        name: r.name || '',
        ip: r.ipAddress || r.ip || '',
        compartments: r.compartmentCount || 4,
        status: r.status === 'online' ? 'Trực tuyến' : 'Ngoại tuyến'
      });
    });
    styleWorksheet(ws);
  }

  // 6. Tab Room
  if (selectedTypes.includes('room')) {
    const rooms = docs.filter(d => d.type === 'room');
    const ws = workbook.addWorksheet('Danh mục Phòng bệnh');
    ws.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Số Phòng', key: 'name', width: 15 },
      { header: 'Tổng Số Giường', key: 'bedsCount', width: 18 },
      { header: 'Tọa Độ X', key: 'x', width: 12 },
      { header: 'Tọa Độ Y', key: 'y', width: 12 }
    ];
    rooms.forEach((r, idx) => {
      ws.addRow({
        stt: idx + 1,
        name: r.name || '',
        bedsCount: Array.isArray(r.beds) ? r.beds.length : 0,
        x: r.x !== undefined ? r.x : '',
        y: r.y !== undefined ? r.y : ''
      });
    });
    styleWorksheet(ws);
  }

  // Helper styling worksheet
  function styleWorksheet(worksheet) {
    worksheet.getRow(1).eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF16A34A' },
      };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
    });

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const isEven = i % 2 === 0;
      row.eachCell(cell => {
        cell.fill = isEven
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7F0' } }
          : null;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        };
      });
    }
  }

  const dateStr = `${formatDateForFile(fromDate)}-${formatDateForFile(toDate)}`;
  const fileName = `SmartHospital_CSDL_${dateStr}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  window.saveAs(new Blob([buffer]), fileName);
}
