// ============================================
// UI UTILITY - Toast, Modal Helper
// ============================================

let toastElement = null;

// Khởi tạo toast element
function initToast() {
  if (!toastElement) {
    toastElement = document.createElement("div");
    toastElement.className = "toast";
    document.body.appendChild(toastElement);
  }
}

// Hiển thị toast
export function showToast(message) {
  initToast();
  toastElement.textContent = message;
  toastElement.classList.add("show");
  setTimeout(() => toastElement.classList.remove("show"), 1800);
}

// Modal helper
export function openModal(modalElement) {
  if (modalElement) {
    modalElement.classList.add("show");
  }
}

export function closeModal(modalElement) {
  if (modalElement) {
    modalElement.classList.remove("show");
  }
}

// Hỗ trợ đóng modal khi click ngoài
export function setupModalClose(modalElement, closeCallback) {
  if (modalElement) {
    modalElement.addEventListener("click", (event) => {
      if (event.target === modalElement) {
        closeCallback();
      }
    });
  }
}

// Focus first input in modal
export function focusFirstInputInModal(modalElement) {
  if (modalElement) {
    const firstInput = modalElement.querySelector("input[name], textarea[name]");
    if (firstInput) {
      firstInput.focus();
    }
  }
}

// Hiển thị overlay dấu tích thành công (SVG animation)
export function showSuccessCheckmark() {
  let overlay = document.getElementById('success-checkmark-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'success-checkmark-overlay';
    overlay.innerHTML = `
      <div class="checkmark-center">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#4cd137" stroke-width="8"/>
          <polyline class="checkmark-animated" points="40,65 55,80 80,45" fill="none" stroke="#4cd137" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  setTimeout(() => { overlay.style.display = 'none'; }, 1500);
}

// Hiển thị hộp thoại cảnh báo trùng giường đẹp mắt và trung tâm
export function showWarningAlert(message, title = "Cảnh báo trùng giường") {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay show";
  overlay.style.zIndex = "100000"; // Đảm bảo đè lên trên các modal khác
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";

  overlay.innerHTML = `
    <div class="modal-card" style="max-width: 440px; width: 90%; text-align: center; padding: 32px 24px; border-top: 5px solid #ef4444; border-radius: 16px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.15); animation: rise 0.2s ease-out; box-sizing: border-box;">
      <div style="width: 56px; height: 56px; background: #fee2e2; color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <h3 style="font-size: 1.35rem; font-weight: 700; color: #1e293b; margin: 0 0 12px 0;">${title}</h3>
      <p style="font-size: 1rem; color: #64748b; line-height: 1.6; margin: 0 0 24px 0;">${message}</p>
      <button id="warning-alert-btn" style="width: 100%; padding: 12px 0; background: #ef4444; color: #fff; border: none; border-radius: 10px; font-weight: 700; font-size: 1.05rem; cursor: pointer; transition: background 0.15s; outline: none;">
        Tôi đã hiểu
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  return new Promise((resolve) => {
    const btn = overlay.querySelector("#warning-alert-btn");
    
    // Thêm hiệu ứng hover cho nút
    btn.onmouseover = () => { btn.style.background = "#dc2626"; };
    btn.onmouseout = () => { btn.style.background = "#ef4444"; };
    
    btn.onclick = () => {
      overlay.remove();
      resolve();
    };
  });
}

// Hiển thị hộp thoại xác nhận (Confirm modal) đẹp mắt dạng Promise
export function showConfirmModal(message, title = "Xác nhận") {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay show";
  overlay.style.zIndex = "100000"; // Đảm bảo đè lên trên các modal khác
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";

  overlay.innerHTML = `
    <div class="modal-card" style="max-width: 440px; width: 90%; text-align: center; padding: 28px 24px; border-radius: 16px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.15); animation: rise 0.2s ease-out; box-sizing: border-box;">
      <div style="width: 56px; height: 56px; background: #eff6ff; color: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <h3 style="font-size: 1.35rem; font-weight: 700; color: #1e293b; margin: 0 0 12px 0;">${title}</h3>
      <p style="font-size: 0.95rem; color: #64748b; line-height: 1.5; margin: 0 0 24px 0;">${message}</p>
      <div style="display: flex; gap: 12px; justify-content: center; width: 100%;">
        <button id="confirm-modal-cancel-btn" style="flex: 1; padding: 12px 0; background: #f1f5f9; color: #475569; border: 1.5px solid #cbd5e1; border-radius: 10px; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.15s; outline: none;">
          Hủy bỏ
        </button>
        <button id="confirm-modal-ok-btn" style="flex: 1; padding: 12px 0; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-weight: 700; font-size: 1rem; cursor: pointer; transition: all 0.15s; outline: none; box-shadow: 0 2px 6px rgba(37,99,235,0.15);">
          Xác nhận
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  return new Promise((resolve) => {
    const okBtn = overlay.querySelector("#confirm-modal-ok-btn");
    const cancelBtn = overlay.querySelector("#confirm-modal-cancel-btn");

    okBtn.onmouseover = () => { okBtn.style.background = "#1d4ed8"; };
    okBtn.onmouseout = () => { okBtn.style.background = "#2563eb"; };

    cancelBtn.onmouseover = () => { cancelBtn.style.background = "#e2e8f0"; };
    cancelBtn.onmouseout = () => { cancelBtn.style.background = "#f1f5f9"; };

    okBtn.onclick = () => {
      overlay.remove();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      overlay.remove();
      resolve(false);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    };
  });
}
