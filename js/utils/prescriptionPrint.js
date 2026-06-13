// ============================================
// Đơn thuốc y tế (Mẫu thực tế Bệnh viện Thủ Đức) — xuất file .doc mở được bằng Word
// ============================================

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseIsoParts(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function formatVNDate(iso) {
  const p = parseIsoParts(iso);
  if (!p) return "…/…/…";
  return `${String(p.d).padStart(2, "0")}/${String(p.mo).padStart(2, "0")}/${p.y}`;
}

function calcAgeFromDob(iso) {
  const p = parseIsoParts(iso);
  if (!p) return "";
  const birth = new Date(p.y, p.mo - 1, p.d);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : "";
}

function displayGender(g) {
  const x = String(g || "").toLowerCase();
  if (x === "nữ" || x === "nu" || x === "female") return "Nữ";
  if (x === "nam" || x === "male") return "Nam";
  return escapeHtml(g || "……");
}

function safeFileName(name) {
  return String(name || "benh-nhan")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "benh-nhan";
}

/**
 * Trình phân tích đơn thuốc thông minh để điền vào bảng
 */
function parsePrescriptionItem(itemText, index) {
  const parts = itemText.split(/[-|;]/).map(p => p.trim());
  let nameAndDosage = parts[0] || "";
  let quantity = "";
  let usage = "Uống theo chỉ dẫn của bác sĩ";

  if (parts.length === 2) {
    const secondPart = parts[1];
    if (/^\d+|SL:|Số lượng:/i.test(secondPart)) {
      quantity = secondPart.replace(/SL:|Số lượng:/i, "").trim();
    } else {
      usage = secondPart;
    }
  } else if (parts.length >= 3) {
    quantity = parts[1].replace(/SL:|Số lượng:/i, "").trim();
    usage = parts[2];
  }

  // Cố gắng tách số lượng nếu viết dạng x14 ở cuối tên thuốc
  if (!quantity) {
    const qtyMatch = nameAndDosage.match(/(?:\s*[xX*]\s*|\s+SL:\s*|\s+Số lượng:\s*)(\d+\s*\w*)$/);
    if (qtyMatch) {
      quantity = qtyMatch[1];
      nameAndDosage = nameAndDosage.substring(0, qtyMatch.index).trim();
    }
  }

  return {
    stt: index + 1,
    nameAndDosage: nameAndDosage || "Tên thuốc",
    quantity: quantity || "14 Viên", // giá trị mặc định nếu thiếu
    usage: usage || "Uống theo hướng dẫn của bác sĩ"
  };
}

/**
 * @param {object} patient — bản ghi bệnh nhân
 */
export function downloadPrescriptionWord(patient) {
  const name = escapeHtml(patient.name || "");
  const dob = formatVNDate(patient.dob);
  const age = calcAgeFromDob(patient.dob) || "……";
  const gender = displayGender(patient.gender);
  
  const cccdRaw = String(patient.citizenId || patient.cccd || "").trim();
  const cccd = escapeHtml(cccdRaw);
  const bhyt = escapeHtml(patient.bhyt || patient.bhxh || patient.insuranceNumber || "");
  const address = escapeHtml(patient.address || patient.diaChi || "Thủ Đức, TP. Hồ Chí Minh");
  const phone = escapeHtml(patient.phone || "");
  const doctor = escapeHtml(patient.doctor || "Bác sĩ điều trị");
  const diagnosis = escapeHtml(patient.diagnosis || "Chưa có chẩn đoán xác định");
  const icdCode = escapeHtml(patient.icdCode || "");

  // Phân tích đơn thuốc sang cấu trúc bảng
  let rowsHtml = "";
  if (patient.prescription) {
    const items = patient.prescription
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(item => item.length > 0);

    if (items.length > 0) {
      items.forEach((item, idx) => {
        const parsed = parsePrescriptionItem(item, idx);
        rowsHtml += `
          <tr style="border-bottom: 1px dotted #888;">
            <td class="tac" style="padding: 6pt; border: 1px solid #000;">${parsed.stt}</td>
            <td style="padding: 6pt; border: 1px solid #000; font-weight: bold;">${escapeHtml(parsed.nameAndDosage)}</td>
            <td class="tac" style="padding: 6pt; border: 1px solid #000; font-weight: bold; color: #1e3a8a;">${escapeHtml(parsed.quantity)}</td>
            <td style="padding: 6pt; border: 1px solid #000; font-style: italic;">${escapeHtml(parsed.usage)}</td>
          </tr>
        `;
      });
    } else {
      rowsHtml = `<tr><td colspan="4" class="tac" style="padding:12pt; border: 1px solid #000; color:#888;">Không có thuốc được chỉ định</td></tr>`;
    }
  } else {
    rowsHtml = `<tr><td colspan="4" class="tac" style="padding:12pt; border: 1px solid #000; color:#888;">Không có thuốc được chỉ định</td></tr>`;
  }

  // Tính ngày tái khám mặc định sau 7 ngày
  const today = new Date();
  const followUpDate = new Date();
  followUpDate.setDate(today.getDate() + 7);
  const fD = String(followUpDate.getDate()).padStart(2, "0");
  const fM = String(followUpDate.getMonth() + 1).padStart(2, "0");
  const fY = followUpDate.getFullYear();

  const tD = String(today.getDate()).padStart(2, "0");
  const tM = String(today.getMonth() + 1).padStart(2, "0");
  const tY = today.getFullYear();

  /* GỐC Đơn thuốc (Phòng & Giường lưu bệnh cũ):
  <div class="mt">Phòng: \${escapeHtml(patient.department || "…")}</div>
  <div>Giường lưu bệnh: \${escapeHtml(patient.room || "…")} - \${escapeHtml(patient.bed || "…")}</div>
  */

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Đơn thuốc</title>
<!--[if gte mso 9]><xml>
<w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument>
</xml><![endif]-->
<style>
body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.35; color: #000; max-width: 210mm; margin: 15mm auto; }
.tac { text-align: center; }
.tar { text-align: right; }
.bold { font-weight: bold; }
.mt { margin-top: 8pt; }
.mb { margin-bottom: 6pt; }
.row { margin: 5pt 0; }
.small { font-size: 10pt; }
.title-main { font-size: 18pt; font-weight: bold; text-align: center; margin: 15pt 0 12pt 0; text-transform: uppercase; letter-spacing: 0.5px; }
.hdr-table { width: 100%; border-collapse: collapse; margin-bottom: 14pt; }
.hdr-table td { vertical-align: top; font-size: 11pt; line-height: 1.3; }
.fill { border-bottom: 1px dotted #000; min-height: 18px; display: inline-block; }
.presc-table { width: 100%; border-collapse: collapse; margin-top: 10pt; margin-bottom: 10pt; }
.presc-table th { border: 1px solid #000; padding: 6pt; background: #f2f2f2; font-weight: bold; }
</style>
</head>
<body>
<table class="hdr-table"><tr>
<td style="width:65%;">
  <div class="bold" style="font-size: 11.5pt; text-transform: uppercase; letter-spacing: 0.2px;">BỆNH VIỆN ...</div>
  <div class="small">Địa chỉ:.....</div>
  <div class="small">Điện thoại: 0......</div>
  <div class="bold mt" style="font-size: 10.5pt; text-decoration: underline;">Khoa Khám Bệnh</div>
  <div style="font-size: 10pt; font-style: italic;">Đơn thuốc nhà thuốc</div>
</td>
<td style="width:35%;" class="tar small">
  <div class="bold" style="font-size:11pt;">Mã HS: ${patient.id ? escapeHtml(patient.id.slice(0, 10).toUpperCase()) : "………………"}</div>
  <div class="mt">Phòng: ${escapeHtml(patient.room || "…")}</div>
  <div>Giường lưu bệnh: ${escapeHtml(patient.bed || "…")}</div>
</td>
</tr></table>

<div class="title-main">ĐƠN THUỐC</div>

<div class="row">
  <span class="bold">Họ tên bệnh nhân:</span> <span class="fill" style="min-width:45%; font-size: 13pt; font-weight: bold; text-transform: uppercase;">${name}</span>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <span class="bold">Tuổi:</span> ${escapeHtml(age)} tuổi
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <span class="bold">Giới tính:</span> ${gender}
</div>

<div class="row">
  <span class="bold">Địa chỉ:</span> <span class="fill" style="min-width: 80%;">${address}</span>
</div>

<div class="row">
  <span class="bold">Chẩn đoán:</span> <span style="font-weight: 500;">${diagnosis}</span>
  ${icdCode ? `&nbsp; <span class="bold">(Mã ICD-10: ${icdCode})</span>` : ""}
</div>

<table class="presc-table">
  <thead>
    <tr>
      <th style="width: 7%; text-align: center;">STT</th>
      <th style="width: 48%; text-align: left;">Tên thuốc - Hàm lượng</th>
      <th style="width: 15%; text-align: center;">SL</th>
      <th style="width: 30%; text-align: left;">Cách dùng</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>

<div class="row" style="margin-top: 14pt; font-weight: bold; font-size: 11pt;">
  Hẹn tái khám ngày: ${fD}/${fM}/${fY}
</div>

<table style="width:100%; margin-top:20pt;"><tr>
<td class="tac" style="width:40%; vertical-align:top; font-size: 11pt;">
  <div class="bold">Người nhận thuốc</div>
  <div style="font-style: italic; color: #555; font-size: 9.5pt;">(Ký và ghi rõ họ tên)</div>
</td>
<td class="tac" style="width:60%; vertical-align:top;">
  <div><em>TP. Hồ Chí Minh, ngày ${tD} tháng ${tM} năm ${tY}</em></div>
  <div class="bold mt" style="font-size: 11pt; text-transform: uppercase;">Bác sĩ kê đơn</div>
  <div style="font-style: italic; color: #555; font-size: 9.5pt; margin-bottom: 45pt;">(Ký và ghi rõ họ tên)</div>
  <div class="bold" style="font-size: 12pt; margin-top: 15pt;">${doctor}</div>
</td>
</tr></table>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const fname = `Don-thuoc-${safeFileName(patient.name)}-${tD}${tM}${tY}.doc`;
  const save = typeof window !== "undefined" && window.saveAs;
  if (save) {
    save(blob, fname);
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
