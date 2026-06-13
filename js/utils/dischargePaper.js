// ============================================
// Giấy ra viện (Mẫu số 02) — xuất file .doc mở được bằng Word
// Không gồm dân tộc, nghề nghiệp. CCCD lấy từ citizenId (form thêm BN).
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

function admissionParts(iso) {
  const p = parseIsoParts(iso);
  if (!p) return { d: "…", mo: "…", y: "…" };
  return { d: String(p.d), mo: String(p.mo), y: String(p.y) };
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
 * @param {object} patient — bản ghi bệnh nhân (đã gộp dischargeDate, dischargeCondition nếu có)
 */
export function downloadDischargePaperWord(patient) {
  const name = escapeHtml(patient.name || "");
  const dob = formatVNDate(patient.dob);
  const age = calcAgeFromDob(patient.dob) || "……";
  const gender = displayGender(patient.gender);
  // CCCD nhập khi thêm bệnh nhân (Firestore: citizenId)
  const cccdRaw = String(patient.citizenId || patient.cccd || "").trim();
  const cccd = escapeHtml(cccdRaw);
  const cccdIssue = escapeHtml(patient.citizenIdIssueDate || patient.cccdNgayCap || "");
  const bhyt = escapeHtml(patient.bhyt || patient.bhxh || patient.insuranceNumber || "");
  const address = escapeHtml(patient.address || patient.diaChi || "");
  const room = escapeHtml(patient.room || "");
  /* GỐC: const bed = escapeHtml(patient.bed || ""); */
  const bedRaw = String(patient.bed || "").replace(/^giường\s+/i, "");
  const bed = escapeHtml(bedRaw);
  const phone = escapeHtml(patient.phone || "");
  const dischargeDate = formatVNDate(patient.dischargeDate);
  const dischargeCondition = escapeHtml(
    patient.dischargeCondition || patient.dischargeNote || patient.tinhTrangXuatVien || ""
  );
  const adm = admissionParts(patient.admissionDate);

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Giấy ra viện</title>
<!--[if gte mso 9]><xml>
<w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument>
</xml><![endif]-->
<style>
body { font-family: "Times New Roman", Times, serif; font-size: 13pt; line-height: 1.35; color: #000; max-width: 210mm; margin: 12mm auto; }
.tac { text-align: center; }
.tar { text-align: right; }
.tdu { text-decoration: underline; }
.bold { font-weight: bold; }
.mt { margin-top: 10pt; }
.mb { margin-bottom: 6pt; }
.row { margin: 4pt 0 4pt 0; }
.small { font-size: 11pt; }
.title-main { font-size: 15pt; font-weight: bold; text-align: center; margin: 16pt 0 14pt 0; text-transform: uppercase; letter-spacing: 0.5px; }
.hdr-table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
.hdr-table td { vertical-align: top; font-size: 11pt; }
.fill { border-bottom: 1px dotted #000; min-height: 18px; display: inline-block; }
</style>
</head>
<body>
<table class="hdr-table"><tr>
<td style="width:36%;">
  <div class="bold">CƠ QUAN CHỦ QUẢN</div>
  <div>………………………………</div>

</td>
<td style="width:28%;" class="tac small">

  <div>Giấy ra viện</div>
  <div class="mt bold" style="font-size:12pt;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
  <div>Độc lập - Tự do - Hạnh phúc</div>
  <div class="mt">---------------</div>
</td>
<td style="width:36%;" class="tar small">
  <div>MS: …/……</div>
  <div class="mt">Số hồ sơ/Số BA: ………………</div>
</td>
</tr></table>

<div class="mb">Số: …/………</div>

<div class="title-main">Giấy ra viện</div>

<div class="row"><span class="bold">Họ tên người bệnh:</span> <span class="fill" style="min-width:70%;">${name}</span></div>

<div class="row">
  <span class="bold">Ngày/tháng/năm sinh:</span> ${dob}
  &nbsp;&nbsp;&nbsp;
  <span class="bold">Tuổi:</span> ${escapeHtml(age)}
  &nbsp;&nbsp;&nbsp;
  <span class="bold">Nam/nữ:</span> ${gender}
</div>

<div class="row">
  <span class="bold">Căn cước công dân (CCCD):</span> ${cccd || "…………………………"}
  &nbsp;&nbsp;&nbsp;
  <span class="bold">Ngày cấp:</span> ${cccdIssue || "……/……/……"}
</div>

<div class="row"><span class="bold">Mã số BHXH/Thẻ BHYT số (nếu có):</span> ${bhyt || "………………………………"}</div>

<div class="row"><span class="bold">Địa chỉ:</span> ${address || "………………………………………………………………"}</div>

<div class="row">
  <span class="bold">Vào viện lúc</span>
  …… <span class="bold">giờ</span> …… <span class="bold">phút</span>, ngày
  ${adm.d} <span class="bold">tháng</span> ${adm.mo} <span class="bold">năm</span> ${adm.y}
</div>

<div class="row"><span class="bold">Điều trị tại:</span> Phòng ${room || "…"} — Giường ${bed || "…"}${phone ? ` — Điện thoại: ${phone}` : ""}</div>

<div class="row"><span class="bold">Ra viện ngày:</span> ${dischargeDate}</div>

<div class="row"><span class="bold">Tình trạng lúc ra viện:</span> ${dischargeCondition || "………………………………"}</div>

<p class="mt small" style="margin-top:18pt;">&nbsp;</p>
<table style="width:100%;margin-top:28pt;"><tr>
<td class="tac" style="width:50%;vertical-align:top;">
  <div class="bold">Giám đốc bệnh viện</div>
  <div style="margin-top:64pt;">(Ký, đóng dấu)</div>
</td>
<td class="tac" style="width:50%;vertical-align:top;">
  <div><em>………., ngày … tháng … năm …</em></div>
  <div class="bold mt">Bác sĩ điều trị</div>
  <div style="margin-top:64pt;">(Ký, ghi rõ họ tên)</div>
</td>
</tr></table>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const fname = `Giay-ra-vien-${safeFileName(patient.name)}-${patient.dischargeDate || "ngay"}.doc`;
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
