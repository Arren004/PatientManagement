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
