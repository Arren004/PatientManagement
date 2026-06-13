// ============================================
// DATABASE CONFIG - Khởi tạo PouchDB & CouchDB LAN Sync
// ============================================

// Khởi tạo cơ sở dữ liệu PouchDB local
const db = new PouchDB('smarthospital');

// Tạo các chỉ mục (indexes) phục vụ việc tìm kiếm nhanh bằng PouchDB Find
db.createIndex({
  index: { fields: ['type'] }
}).then(() => {
  return db.createIndex({ index: { fields: ['type', 'username'] } });
}).then(() => {
  console.log('[PouchDB] Đã khởi tạo thành công các chỉ mục tìm kiếm.');
}).catch(err => {
  console.error('[PouchDB] Lỗi tạo chỉ mục:', err);
});

// Tự động nhận diện IP của máy chủ CouchDB (máy chính chạy backend/database)
const currentHost = (typeof window !== 'undefined' && window.location) ? window.location.hostname : 'localhost';
const DEFAULT_COUCHDB_URL = `http://admin:admin@${currentHost}:5984/smarthospital`;

// Lấy CouchDB Server URL từ localStorage (cho phép tùy chọn đổi IP)
let couchdbUrl = localStorage.getItem('couchdb_server_url');

// Nếu chưa thiết lập, hoặc đang là localhost/127.0.0.1 nhưng thực tế đang truy cập từ xa qua LAN
if (!couchdbUrl || 
    ((couchdbUrl.includes('localhost') || couchdbUrl.includes('127.0.0.1')) && 
     currentHost !== 'localhost' && currentHost !== '127.0.0.1')) {
    couchdbUrl = DEFAULT_COUCHDB_URL;
    localStorage.setItem('couchdb_server_url', couchdbUrl);
}

// Quản lý đồng bộ giữa PouchDB và CouchDB LAN (Tách luồng đọc/ghi độc lập)
let syncFromHandler = null;
let syncToHandler = null;

function startSync(url) {
  if (syncFromHandler) {
    syncFromHandler.cancel();
  }
  if (syncToHandler) {
    syncToHandler.cancel();
  }
  if (!url) return;

  console.log(`[PouchDB] Bắt đầu đồng bộ với CouchDB Server: ${url}`);
  const remoteDB = new PouchDB(url, {
    skip_setup: true
  });

  // 1. Nhận dữ liệu từ máy chủ về máy khách (Pull) - Ưu tiên nhận thông báo lập tức
  syncFromHandler = db.replicate.from(remoteDB, {
    live: true,
    retry: true,
    heartbeat: 2000,     // Thăm dò kết nối nhanh để tránh timeout/idling
    batch_size: 1,       // Cập nhật ngay lập tức từng tài liệu, không gom lô chờ đợi
    batches_limit: 1
  }).on('active', () => {
    console.log('[PouchDB Sync] Đang nhận cập nhật từ máy chủ...');
  }).on('change', (info) => {
    console.log('[PouchDB Sync] Nhận thay đổi thành công:', info.ids);
  }).on('error', (err) => {
    console.error('[PouchDB Sync Pull Error] Lỗi nhận dữ liệu:', err);
  });

  // 2. Đẩy dữ liệu từ máy khách lên máy chủ (Push)
  syncToHandler = db.replicate.to(remoteDB, {
    live: true,
    retry: true,
    batch_size: 1,
    batches_limit: 1
  }).on('active', () => {
    console.log('[PouchDB Sync] Đang gửi dữ liệu lên máy chủ...');
  }).on('error', (err) => {
    console.error('[PouchDB Sync Push Error] Lỗi gửi dữ liệu:', err);
  });
}

// Chạy tiến trình đồng bộ
startSync(couchdbUrl);

// Xuất hàm cấu hình để có thể đổi IP server CouchDB từ xa qua Console/UI
window.updateCouchDbUrl = function(newUrl) {
  localStorage.setItem('couchdb_server_url', newUrl);
  startSync(newUrl);
  console.log('[PouchDB] Đã cập nhật URL CouchDB mới:', newUrl);
};

// Khôi phục phiên đăng nhập của user từ localStorage khi tải lại trang
let initialUser = null;
try {
  const saved = localStorage.getItem('auth_current_user');
  if (saved) {
    initialUser = JSON.parse(saved);
  }
} catch (e) {
  console.warn('[PouchDB Config] Không thể khôi phục phiên đăng nhập cũ:', e);
}

// Giả lập cấu trúc Firebase Auth và Analytics để không bị vỡ các file import cũ
const app = {
  options: {}
};

const auth = {
  currentUser: initialUser
};

const analytics = null;

export { app, auth, db, analytics };
