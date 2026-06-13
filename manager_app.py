import os
import sys
import time
import socket
import subprocess
import webbrowser
import threading
import queue
import tkinter as tk
from tkinter import messagebox
from tkinter import PhotoImage
import http.server
import mimetypes

# Sửa lỗi MIME type trên Windows để trình duyệt không chặn file JS/CSS
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Bộ xử lý yêu cầu HTTP tĩnh không lưu cache, hỗ trợ CORS"""
    def log_message(self, format, *args):
        # Bỏ qua ghi log ra console để tránh crash tiến trình khi đóng gói
        # dưới dạng PyInstaller --windowed (nơi sys.stderr là None)
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

# --- HẰNG SỐ CẤU HÌNH ---
PORT_FRONTEND = 3000
PORT_BACKEND = 8000

# Tông màu Tối Cao Cấp (Premium Slate Dark Mode)
COLOR_BG_MAIN = "#0f172a"        # Nền Slate 900 (Navy tối)
COLOR_BG_CARD = "#1e293b"        # Nền Card Slate 800 (Navy nhạt hơn)
COLOR_TEXT_MAIN = "#f8fafc"      # Chữ chính Slate 50 (Trắng mờ)
COLOR_TEXT_MUTED = "#94a3b8"     # Chữ phụ Slate 400 (Xám nhạt)
COLOR_TEXT_ACCENT = "#38bdf8"    # Chữ điểm nhấn Sky 400 (Xanh Cyan sáng)

COLOR_BTN_START = "#3b82f6"      # Xanh dương sáng khi hệ thống tắt (Bấm để bật)
COLOR_BTN_START_HOVER = "#2563eb"
COLOR_BTN_STOP = "#10b981"       # Xanh lá khi hệ thống bật (Bấm để tắt)
COLOR_BTN_STOP_HOVER = "#059669"

COLOR_LED_ON = "#10b981"         # LED xanh lá (Hoạt động)
COLOR_LED_OFF = "#ef4444"        # LED đỏ (Dừng)

class SmartHospitalManagerApp:
    def scale(self, val):
        if not hasattr(self, '_dpi_scale'):
            try:
                dpi = self.root.winfo_fpixels('1i')
                self._dpi_scale = dpi / 96.0
            except Exception:
                self._dpi_scale = 1.0
        return int(val * self._dpi_scale)

    def __init__(self, root):
        self.root = root
        self.root.title("Smart Hospital Manager")
        
        # Tính toán DPI scale và đặt kích thước cửa sổ phù hợp
        self.width = self.scale(500)
        self.height = self.scale(700)
        self.root.geometry(f"{self.width}x{self.height}")
        self.root.configure(bg="#f0f7ff")
        self.root.resizable(False, False)

        # Ẩn thanh tiêu đề mặc định để dùng Custom Title Bar
        self.root.overrideredirect(True)

        # Đăng ký sự kiện Map để tự phục hồi trạng thái borderless khi de-minimize
        self.root.bind("<Map>", self.on_map)

        # Thử tải icon cho cửa sổ chính
        ico_path = os.path.join("image", "logo.ico")
        logo_path = os.path.join("image", "logo.png")
        if os.path.exists(ico_path):
            try:
                self.root.iconbitmap(default=ico_path)
            except Exception:
                pass
        elif os.path.exists(logo_path):
            try:
                self.window_icon = PhotoImage(file=logo_path)
                self.root.iconphoto(True, self.window_icon)
            except Exception:
                pass

        # Căn giữa cửa sổ trên màn hình
        self.center_window()

        # Buộc cửa sổ hiện ở taskbar sau khi khởi động
        self.root.after(200, self.show_in_taskbar)

        # Cơ chế gọi hàm an toàn luồng (Thread-safe Call)
        self.callback_queue = queue.Queue()
        self.root.after(100, self.process_callback_queue)

        # Quản lý luồng tiến trình và thời gian
        self.proc_frontend = None
        self.proc_backend = None
        self.is_running = False
        self.is_starting = False
        self.is_stopping = False
        self.start_time = None
        
        # Trạng thái các cổng (cập nhật từ luồng nền)
        self.status_frontend = False
        self.status_backend = False
        self.should_auto_open_browser = False  # Chỉ mở trình duyệt khi người dùng bấm kích hoạt hệ thống

        self.drag_x = 0
        self.drag_y = 0

        # Bắt đầu luồng kiểm tra cổng định kỳ
        self.stop_monitor = False
        self.monitor_thread = threading.Thread(target=self.monitor_ports_loop, daemon=True)
        self.monitor_thread.start()

        # Tạo giao diện người dùng
        self.create_widgets()

        # Bắt đầu vòng lặp cập nhật giao diện
        self.update_gui_loop()

        # Đăng ký sự kiện tắt ứng dụng
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def start_drag(self, event):
        self.drag_x = event.x
        self.drag_y = event.y

    def drag(self, event):
        x = self.root.winfo_x() + (event.x - self.drag_x)
        y = self.root.winfo_y() + (event.y - self.drag_y)
        self.root.geometry(f"+{x}+{y}")

    def _start_transition(self):
        self._in_transition = True
        if hasattr(self, "_transition_timer") and self._transition_timer:
            try:
                self.root.after_cancel(self._transition_timer)
            except Exception:
                pass
            self._transition_timer = None
        self._transition_timer = self.root.after(500, self._end_transition)

    def _end_transition(self):
        self._in_transition = False
        self._transition_timer = None

    def minimize_window(self):
        self._start_transition()
        self.root.overrideredirect(False)
        self.root.update_idletasks()
        self.root.state('iconic')

    def on_map(self, event):
        if getattr(self, "_in_transition", False):
            return
        self._start_transition()
        self.root.overrideredirect(True)
        self.show_in_taskbar()

    def center_window(self):
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f'{width}x{height}+{x}+{y}')

    def safe_call(self, func, *args, **kwargs):
        """Đẩy callback vào hàng đợi để chạy an toàn trên luồng chính (Main Thread)"""
        self.callback_queue.put((func, args, kwargs))

    def process_callback_queue(self):
        """Vòng lặp xử lý các yêu cầu thay đổi giao diện từ luồng phụ"""
        while not self.callback_queue.empty():
            try:
                func, args, kwargs = self.callback_queue.get_nowait()
                func(*args, **kwargs)
            except Exception as e:
                print(f"[Error] process_callback_queue execution failed: {e}")
        self.root.after(100, self.process_callback_queue)

    def open_web_interface(self):
        webbrowser.open(f"http://127.0.0.1:{PORT_FRONTEND}")

    def copy_to_clipboard(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.lbl_lan_val)
        # Thay đổi icon nút copy để phản hồi trực quan
        self.btn_copy.configure(text="✔", fg="#10b981")
        self.root.after(1500, lambda: self.btn_copy.configure(text="📋", fg="#475569"))

    def create_widgets(self):
        # 1. Custom Title Bar màu xanh dương đậm
        self.title_bar = tk.Frame(self.root, bg="#2563eb", height=self.scale(40))
        self.title_bar.place(x=0, y=0, width=self.scale(500), height=self.scale(40))
        
        # Đăng ký sự kiện kéo thả cho title_bar
        self.title_bar.bind("<ButtonPress-1>", self.start_drag)
        self.title_bar.bind("<B1-Motion>", self.drag)

        # Icon chữ thập y tế mờ bên trái thanh tiêu đề
        self.title_icon = tk.Label(self.title_bar, text="+", font=("Segoe UI", 12, "bold"), fg="#ffffff", bg="#3b82f6", width=2, height=1)
        self.title_icon.place(x=self.scale(12), y=self.scale(8))
        
        # Tiêu đề ứng dụng
        self.title_text = tk.Label(
            self.title_bar,
            text="Smart Hospital Manager",
            font=("Segoe UI", 10, "bold"),
            fg="#ffffff",
            bg="#2563eb"
        )
        self.title_text.place(x=self.scale(42), y=self.scale(9))
        self.title_text.bind("<ButtonPress-1>", self.start_drag)
        self.title_text.bind("<B1-Motion>", self.drag)

        # Nút thu nhỏ cửa sổ (Minimize)
        self.btn_minimize = tk.Button(
            self.title_bar,
            text="—",
            font=("Segoe UI", 9, "bold"),
            fg="#ffffff",
            bg="#2563eb",
            activebackground="#1d4ed8",
            activeforeground="#ffffff",
            bd=0,
            cursor="hand2",
            relief="flat",
            command=self.minimize_window
        )
        self.btn_minimize.place(x=self.scale(420), y=0, width=self.scale(40), height=self.scale(40))

        # Nút đóng cửa sổ (Close)
        self.btn_close = tk.Button(
            self.title_bar,
            text="✕",
            font=("Segoe UI", 10, "bold"),
            fg="#ffffff",
            bg="#2563eb",
            activebackground="#dc2626",
            activeforeground="#ffffff",
            bd=0,
            cursor="hand2",
            relief="flat",
            command=self.on_close
        )
        self.btn_close.place(x=self.scale(460), y=0, width=self.scale(40), height=self.scale(40))

        # 2. Container nền nội dung
        self.bg_frame = tk.Frame(self.root, bg="#f0f7ff")
        self.bg_frame.place(x=0, y=self.scale(40), width=self.scale(500), height=self.scale(660))

        # Vẽ canvas họa tiết trang trí chữ thập mờ
        self.bg_canvas = tk.Canvas(self.bg_frame, width=self.scale(500), height=self.scale(660), bg="#f0f7ff", bd=0, highlightthickness=0)
        self.bg_canvas.place(x=0, y=0)
        self.bg_canvas.create_text(self.scale(40), self.scale(100), text="+", font=("Segoe UI", self.scale(48)), fill="#e0f2fe")
        self.bg_canvas.create_text(self.scale(460), self.scale(180), text="+", font=("Segoe UI", self.scale(48)), fill="#e0f2fe")
        self.bg_canvas.create_text(self.scale(440), self.scale(500), text="+", font=("Segoe UI", self.scale(36)), fill="#e0f2fe")

        # 3. Logo Badge Container
        self.logo_frame = tk.Frame(self.bg_frame, bg="#dbeafe", bd=0)
        self.logo_frame.place(x=self.scale(190), y=self.scale(25), width=self.scale(120), height=self.scale(120))
        
        self.logo_canvas = tk.Canvas(self.logo_frame, width=self.scale(120), height=self.scale(120), bg="#dbeafe", bd=0, highlightthickness=0)
        self.logo_canvas.pack()

        # Tải logo hoặc vẽ robot thay thế
        self.logo_img = None
        logo_path = os.path.join("image", "logo.png")
        if os.path.exists(logo_path):
            try:
                full_img = PhotoImage(file=logo_path)
                self.logo_img = full_img.subsample(10, 10)
                # Vòng tròn màu trắng làm nền
                self.logo_canvas.create_oval(self.scale(10), self.scale(10), self.scale(110), self.scale(110), fill="#ffffff", outline="#bfdbfe", width=2)
                self.logo_canvas.create_image(self.scale(60), self.scale(60), image=self.logo_img, anchor="center")
            except Exception:
                self.draw_fallback_logo_small()
        else:
            self.draw_fallback_logo_small()

        # 4. Tên ứng dụng lớn & Slogan (Sắp xếp tăng khoảng cách để không bị đè chữ khi scale)
        self.lbl_title = tk.Label(
            self.bg_frame,
            text="Smart Hospital Manager",
            font=("Segoe UI", 16, "bold"),
            bg="#f0f7ff",
            fg="#1e293b"
        )
        self.lbl_title.place(x=self.scale(20), y=self.scale(155), width=self.scale(460))

        self.lbl_slogan = tk.Label(
            self.bg_frame,
            text="Thông minh hơn để chăm sóc tốt hơn",
            font=("Segoe UI", 10),
            bg="#f0f7ff",
            fg="#64748b"
        )
        self.lbl_slogan.place(x=self.scale(20), y=self.scale(195), width=self.scale(460))

        # 5. Thẻ Trạng thái Hệ thống (System Status Card)
        self.card_status = tk.Frame(self.bg_frame, bg="#ffffff", bd=0, highlightthickness=1, highlightbackground="#e2e8f0")
        self.card_status.place(x=self.scale(25), y=self.scale(230), width=self.scale(450), height=self.scale(210))

        # Đèn LED tròn trạng thái chung
        self.status_led_canvas = tk.Canvas(self.card_status, width=self.scale(12), height=self.scale(12), bg="#ffffff", bd=0, highlightthickness=0)
        self.status_led_canvas.place(x=self.scale(15), y=self.scale(17))
        self.status_led_circle = self.status_led_canvas.create_oval(self.scale(1), self.scale(1), self.scale(11), self.scale(11), fill="#94a3b8", outline="")

        self.lbl_status = tk.Label(
            self.card_status,
            text="Hệ thống đang dừng",
            font=("Segoe UI", 10, "bold"),
            bg="#ffffff",
            fg="#64748b"
        )
        self.lbl_status.place(x=self.scale(32), y=self.scale(12))

        # Capsule hiển thị Uptime (thời gian chạy)
        self.uptime_badge = tk.Frame(self.card_status, bg="#f1f5f9", bd=0)
        self.uptime_badge.place(x=self.scale(320), y=self.scale(11), width=self.scale(115), height=self.scale(26))
        
        self.lbl_uptime = tk.Label(
            self.uptime_badge,
            text="--h --m --s",
            font=("Segoe UI", 9, "bold"),
            bg="#f1f5f9",
            fg="#475569"
        )
        self.lbl_uptime.place(relx=0.5, rely=0.5, anchor="center")

        # Khung dịch vụ chi tiết: Web Interface (Port 3000)
        self.web_row = tk.Frame(self.card_status, bg="#f8fafc", bd=0)
        self.web_row.place(x=self.scale(15), y=self.scale(55), width=self.scale(420), height=self.scale(60))
        
        self.lbl_web_icon = tk.Label(self.web_row, text="🌐", font=("Segoe UI", 14), bg="#e0f2fe", fg="#2563eb", width=2, height=1)
        self.lbl_web_icon.place(x=self.scale(12), y=self.scale(12))
        
        self.lbl_web_title = tk.Label(self.web_row, text="Web Interface", font=("Segoe UI", 10, "bold"), bg="#f8fafc", fg="#1e293b")
        self.lbl_web_title.place(x=self.scale(55), y=self.scale(10))
        self.lbl_web_desc = tk.Label(self.web_row, text=f"Port {PORT_FRONTEND}", font=("Segoe UI", 8), bg="#f8fafc", fg="#64748b")
        self.lbl_web_desc.place(x=self.scale(55), y=self.scale(30))
        
        self.web_status_badge = tk.Frame(self.web_row, bg="#f1f5f9", bd=0)
        self.web_status_badge.place(x=self.scale(330), y=self.scale(17), width=self.scale(75), height=self.scale(26))
        self.lbl_web_status = tk.Label(self.web_status_badge, text="● Inactive", font=("Segoe UI", 8, "bold"), bg="#f1f5f9", fg="#475569")
        self.lbl_web_status.place(relx=0.5, rely=0.5, anchor="center")

        # Khung dịch vụ chi tiết: Backend Service (Port 8000)
        self.be_row = tk.Frame(self.card_status, bg="#f8fafc", bd=0)
        self.be_row.place(x=self.scale(15), y=self.scale(130), width=self.scale(420), height=self.scale(60))
        
        self.lbl_be_icon = tk.Label(self.be_row, text="⚙", font=("Segoe UI", 14), bg="#e0f2fe", fg="#2563eb", width=2, height=1)
        self.lbl_be_icon.place(x=self.scale(12), y=self.scale(12))
        
        self.lbl_be_title = tk.Label(self.be_row, text="Backend Service", font=("Segoe UI", 10, "bold"), bg="#f8fafc", fg="#1e293b")
        self.lbl_be_title.place(x=self.scale(55), y=self.scale(10))
        self.lbl_be_desc = tk.Label(self.be_row, text=f"Port {PORT_BACKEND}", font=("Segoe UI", 8), bg="#f8fafc", fg="#64748b")
        self.lbl_be_desc.place(x=self.scale(55), y=self.scale(30))
        
        self.be_status_badge = tk.Frame(self.be_row, bg="#f1f5f9", bd=0)
        self.be_status_badge.place(x=self.scale(330), y=self.scale(17), width=self.scale(75), height=self.scale(26))
        self.lbl_be_status = tk.Label(self.be_status_badge, text="● Inactive", font=("Segoe UI", 8, "bold"), bg="#f1f5f9", fg="#475569")
        self.lbl_be_status.place(relx=0.5, rely=0.5, anchor="center")

        # Nút Console xem log tiến trình Backend (Port 8000) thời gian thực
        self.btn_console = tk.Button(
            self.be_row,
            text="💻 Console",
            font=("Segoe UI", 8, "bold"),
            bg="#eff6ff",
            fg="#2563eb",
            activebackground="#dbeafe",
            activeforeground="#1d4ed8",
            bd=0,
            cursor="hand2",
            relief="flat",
            command=self.open_console
        )
        self.btn_console.place(x=self.scale(200), y=self.scale(15), width=self.scale(95), height=self.scale(30))

        # 6. Thẻ Thông tin Mạng (Network Info Card)
        self.card_net = tk.Frame(self.bg_frame, bg="#ffffff", bd=0, highlightthickness=1, highlightbackground="#e2e8f0")
        self.card_net.place(x=self.scale(25), y=self.scale(455), width=self.scale(450), height=self.scale(105))

        self.lbl_net_icon = tk.Label(self.card_net, text="📶", font=("Segoe UI", 10), bg="#ffffff", fg="#2563eb")
        self.lbl_net_icon.place(x=self.scale(15), y=self.scale(15))
        self.lbl_net_title = tk.Label(self.card_net, text="Thông tin mạng", font=("Segoe UI", 10, "bold"), bg="#ffffff", fg="#1e293b")
        self.lbl_net_title.place(x=self.scale(38), y=self.scale(12))

        self.net_badge = tk.Frame(self.card_net, bg="#eff6ff", bd=0)
        self.net_badge.place(x=self.scale(385), y=self.scale(12), width=self.scale(50), height=self.scale(22))
        self.lbl_net_badge = tk.Label(self.net_badge, text="LAN", font=("Segoe UI", 8, "bold"), bg="#eff6ff", fg="#2563eb")
        self.lbl_net_badge.place(relx=0.5, rely=0.5, anchor="center")

        # Hộp hiển thị URL IP LAN để copy
        self.lan_ip = self.get_local_ip()
        self.lbl_lan_val = f"http://{self.lan_ip}:{PORT_FRONTEND}"
        
        self.entry_lan = tk.Entry(
            self.card_net,
            font=("Segoe UI", 10),
            bg="#f8fafc",
            fg="#2563eb",
            bd=0,
            highlightthickness=1,
            highlightbackground="#cbd5e1",
            justify="left"
        )
        self.entry_lan.insert(0, self.lbl_lan_val)
        self.entry_lan.configure(state="readonly")
        self.entry_lan.place(x=self.scale(15), y=self.scale(50), width=self.scale(360), height=self.scale(35))

        # Nút copy liên kết
        self.btn_copy = tk.Button(
            self.card_net,
            text="📋",
            font=("Segoe UI", 11),
            bg="#eff6ff",
            fg="#475569",
            activebackground="#dbeafe",
            activeforeground="#2563eb",
            bd=0,
            cursor="hand2",
            relief="flat",
            command=self.copy_to_clipboard
        )
        self.btn_copy.place(x=self.scale(385), y=self.scale(50), width=self.scale(50), height=self.scale(35))

        # 7. Nút Hành động ở chân ứng dụng (Footer Buttons)
        # Nút chính để Bật hệ thống / Tắt hệ thống
        self.btn_toggle = tk.Button(
            self.bg_frame,
            text="BẬT HỆ THỐNG",
            font=("Segoe UI", 11, "bold"),
            bg="#2563eb",
            fg="#ffffff",
            activebackground="#1d4ed8",
            activeforeground="#ffffff",
            bd=0,
            cursor="hand2",
            relief="flat",
            command=self.toggle_system
        )
        self.btn_toggle.place(x=self.scale(25), y=self.scale(585), width=self.scale(450), height=self.scale(45))

        # Nút phụ "MỞ GIAO DIỆN WEB" chỉ hiển thị khi hệ thống chạy
        self.btn_open_web = tk.Button(
            self.bg_frame,
            text="MỞ GIAO DIỆN WEB  ›",
            font=("Segoe UI", 11, "bold"),
            bg="#2563eb",
            fg="#ffffff",
            activebackground="#1d4ed8",
            activeforeground="#ffffff",
            bd=0,
            cursor="hand2",
            relief="flat",
            command=self.open_web_interface
        )
        self.btn_open_web.place_forget()

    def draw_fallback_logo_small(self):
        # Vẽ logo hình chữ thập y tế thay thế nếu không có logo.png
        self.logo_canvas.create_oval(self.scale(15), self.scale(15), self.scale(105), self.scale(105), fill="#dbeafe", outline="#bfdbfe", width=2)
        self.logo_canvas.create_rectangle(self.scale(54), self.scale(32), self.scale(66), self.scale(88), fill="#2563eb", outline="")
        self.logo_canvas.create_rectangle(self.scale(32), self.scale(54), self.scale(88), self.scale(66), fill="#2563eb", outline="")

    def open_console(self):
        """Mở cửa sổ PowerShell theo dõi log thời gian thực (real-time tail log)"""
        log_path = os.path.join("server", "backend.log")
        abs_log_path = os.path.abspath(log_path)
        
        # Tạo file log nếu chưa tồn tại
        if not os.path.exists(abs_log_path):
            try:
                os.makedirs(os.path.dirname(abs_log_path), exist_ok=True)
                with open(abs_log_path, "a", encoding="utf-8") as f:
                    f.write("--- Khởi tạo tệp nhật ký backend ---\n")
            except Exception:
                pass
        
        try:
            # Lệnh Get-Content -Wait tương đương với tail -f trên Linux, mở trong cửa sổ PowerShell riêng
            # Thiết lập mã hóa UTF-8 để hiển thị tiếng Việt chính xác trong cửa sổ console
            cmd = f'start powershell.exe -NoExit -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Content -Path \'{abs_log_path}\' -Encoding utf8 -Wait -Tail 50"'
            subprocess.Popen(cmd, shell=True)
        except Exception as e:
            messagebox.showerror("Lỗi", f"Không thể mở console log:\n{e}")

    def show_in_taskbar(self):
        """Bắt buộc cửa sổ borderless hiển thị dưới thanh Taskbar trên Windows và gán icon cụ thể"""
        if os.name == 'nt':
            try:
                self._start_transition()
                
                import ctypes
                hwnd = int(self.root.wm_frame(), 16)
                
                # Các hằng số Windows style mở rộng
                GWL_EXSTYLE = -20
                WS_EX_APPWINDOW = 0x00040000
                WS_EX_TOOLWINDOW = 0x00000080
                
                # Đọc style hiện tại
                style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
                # Xóa style toolwindow (ẩn ở taskbar) và thêm style appwindow (hiện ở taskbar)
                style = style & ~WS_EX_TOOLWINDOW
                style = style | WS_EX_APPWINDOW
                
                # Đặt AppUserModelID độc lập để tránh dùng icon cache của file chạy exe cũ
                try:
                    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("retobots.smart_hospital.manager.1")
                except Exception:
                    pass
                
                # Nạp và thiết lập icon cho window và taskbar một cách tường minh
                try:
                    ico_path = os.path.abspath(os.path.join("image", "logo.ico"))
                    if os.path.exists(ico_path):
                        WM_SETICON = 0x0080
                        ICON_SMALL = 0
                        ICON_BIG = 1
                        IMAGE_ICON = 1
                        LR_LOADFROMFILE = 0x00000010
                        
                        hicon = ctypes.windll.user32.LoadImageW(
                            None, 
                            ico_path, 
                            IMAGE_ICON, 
                            0, 0, 
                            LR_LOADFROMFILE
                        )
                        if hicon:
                            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon)
                            ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon)
                except Exception as e:
                    print(f"[Warning] Không thể nạp explicit taskbar icon: {e}")
                
                # Ẩn và hiện lại cửa sổ để Windows Shell cập nhật biểu tượng dưới taskbar ngay lập tức
                self.root.withdraw()
                ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
                # Cập nhật frame và taskbar
                # SWP_NOMOVE (2) | SWP_NOSIZE (1) | SWP_NOZORDER (4) | SWP_FRAMECHANGED (32) = 37 (0x27)
                ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0027)
                self.root.deiconify()
                
                # Ép lấy nét (focus) cho cửa sổ chính
                self.root.focus_force()
            except Exception as e:
                print(f"[Warning] Không thể hiện biểu tượng dưới Taskbar: {e}")

    def get_local_ip(self):
        """Lấy IP mạng LAN thực tế của máy tính"""
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip

    def on_btn_hover(self, event):
        if not self.is_running:
            self.btn_toggle.configure(bg=COLOR_BTN_START_HOVER)
        else:
            self.btn_toggle.configure(bg=COLOR_BTN_STOP_HOVER)

    def on_btn_leave(self, event):
        if not self.is_running:
            self.btn_toggle.configure(bg=COLOR_BTN_START)
        else:
            self.btn_toggle.configure(bg=COLOR_BTN_STOP)

    def check_port(self, port):
        """Kiểm tra xem một cổng mạng cục bộ có đang mở/lắng nghe không"""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.3)
        try:
            s.connect(("127.0.0.1", port))
            s.close()
            return True
        except Exception:
            return False

    def monitor_ports_loop(self):
        """Vòng lặp ngầm chạy độc lập kiểm tra kết nối định kỳ"""
        while not self.stop_monitor:
            self.status_frontend = self.check_port(PORT_FRONTEND)
            self.status_backend = self.check_port(PORT_BACKEND)
            
            # Tự động mở trình duyệt nếu kích hoạt Bật và Frontend vừa mới mở thành công (dự phòng)
            if self.is_running and self.status_frontend and self.should_auto_open_browser:
                self.should_auto_open_browser = False
                webbrowser.open(f"http://127.0.0.1:{PORT_FRONTEND}")
                
            time.sleep(0.4)  # Giảm xuống 0.4s để nhận biết trạng thái cổng nhanh hơn nhiều

    def update_gui_loop(self):
        """Cập nhật trạng thái đèn LED và nhãn thông tin định kỳ dựa trên luồng check cổng"""
        # Cập nhật trạng thái hiển thị của các hàng dịch vụ con
        if self.status_frontend:
            self.web_status_badge.configure(bg="#d1fae5")
            self.lbl_web_status.configure(text="● Active", bg="#d1fae5", fg="#065f46")
        else:
            self.web_status_badge.configure(bg="#f1f5f9")
            self.lbl_web_status.configure(text="● Inactive", bg="#f1f5f9", fg="#475569")

        if self.status_backend:
            self.be_status_badge.configure(bg="#d1fae5")
            self.lbl_be_status.configure(text="● Active", bg="#d1fae5", fg="#065f46")
        else:
            self.be_status_badge.configure(bg="#f1f5f9")
            self.lbl_be_status.configure(text="● Inactive", bg="#f1f5f9", fg="#475569")

        # Cập nhật thời gian hoạt động Uptime
        if self.is_running and self.start_time is not None:
            elapsed = int(time.time() - self.start_time)
            hours = elapsed // 3600
            minutes = (elapsed % 3600) // 60
            seconds = elapsed % 60
            uptime_str = f"{hours:02d}h {minutes:02d}m {seconds:02d}s"
            self.lbl_uptime.configure(text=uptime_str, bg="#d1fae5", fg="#065f46")
            self.uptime_badge.configure(bg="#d1fae5")

        actual_running = self.status_frontend or self.status_backend

        # Logic đồng bộ trạng thái thông minh tránh Race Condition khi bấm tắt/bật
        if self.is_stopping:
            if not actual_running:
                self.is_stopping = False
                self.set_gui_stopped_state()
        elif self.is_starting:
            if actual_running:
                self.is_starting = False
                self.set_gui_running_state()
        else:
            # Tự động đồng bộ trạng thái nếu người dùng thay đổi bên ngoài
            if not actual_running and self.is_running:
                self.set_gui_stopped_state()
            elif actual_running and not self.is_running:
                self.set_gui_running_state()

        # Gọi lại sau 200ms để nút bấm và đèn phản hồi nhạy hơn
        self.root.after(200, self.update_gui_loop)

    def set_gui_running_state(self):
        self.is_running = True
        
        # Cập nhật trạng thái card chính
        self.status_led_canvas.itemconfig(self.status_led_circle, fill="#10b981")  # LED xanh lá
        self.lbl_status.configure(text="Hệ thống đang hoạt động", fg="#059669")
        self.card_status.configure(highlightbackground="#bbf7d0")  # Đổi viền card sang xanh lá nhạt

        # Bật cấu hình hiển thị 2 nút (Mở web rộng + Tắt hệ thống thu nhỏ) ở chân
        self.btn_toggle.place(x=self.scale(355), y=self.scale(585), width=self.scale(120), height=self.scale(45))
        self.btn_toggle.configure(text="TẮT", bg="#ef4444", activebackground="#dc2626")
        self.btn_open_web.place(x=self.scale(25), y=self.scale(585), width=self.scale(320), height=self.scale(45))
        
        if self.start_time is None:
            self.start_time = time.time()

    def set_gui_stopped_state(self):
        self.is_running = False
        self.start_time = None
        self.should_auto_open_browser = False

        # Cập nhật trạng thái card chính
        self.status_led_canvas.itemconfig(self.status_led_circle, fill="#94a3b8")  # LED xám
        self.lbl_status.configure(text="Hệ thống đang dừng", fg="#64748b")
        self.card_status.configure(highlightbackground="#e2e8f0")  # Trả viền card về màu xám nhạt
        self.lbl_uptime.configure(text="--h --m --s", bg="#f1f5f9", fg="#475569")
        self.uptime_badge.configure(bg="#f1f5f9")

        # Thu gọn hiển thị chỉ 1 nút "KÍCH HOẠT HỆ THỐNG"
        self.btn_open_web.place_forget()
        self.btn_toggle.place(x=self.scale(25), y=self.scale(585), width=self.scale(450), height=self.scale(45))
        self.btn_toggle.configure(text="KÍCH HOẠT HỆ THỐNG", bg="#2563eb", activebackground="#1d4ed8")

    def toggle_system(self):
        if not self.is_running:
            # Nhấn nút BẬT HỆ THỐNG
            self.is_starting = True
            self.is_stopping = False
            self.should_auto_open_browser = True  # Cho phép tự động mở trình duyệt lần này
            self.set_gui_running_state()
            self.lbl_status.configure(text="Đang khởi chạy hệ thống...", fg="#2563eb")
            threading.Thread(target=self.start_all_services, daemon=True).start()
        else:
            # Nhấn nút TẮT HỆ THỐNG
            self.is_stopping = True
            self.is_starting = False
            self.set_gui_stopped_state()
            self.lbl_status.configure(text="Đang dừng hệ thống...", fg="#ef4444")
            threading.Thread(target=self.stop_all_services, daemon=True).start()

    def start_all_services(self):
        """Khởi động ngầm các dịch vụ trong luồng độc lập để tránh đứng đơ giao diện"""
        try:
            # 1. Tìm đường dẫn Python của môi trường ảo (Virtual Environment)
            # Thử tìm các vị trí mặc định của venv
            python_exe = "python"
            venv_paths = [
                os.path.join(".venv", "Scripts", "python.exe"),
                os.path.join("server", "venv", "Scripts", "python.exe"),
                os.path.join("venv", "Scripts", "python.exe")
            ]
            for vp in venv_paths:
                if os.path.exists(vp):
                    python_exe = vp
                    break

            # 2. Khởi động Backend Python Server (Port 8000)
            # Khởi chạy không hiển thị cửa sổ cmd (CREATE_NO_WINDOW trên Windows)
            backend_script = os.path.join("server", "main.py")
            if os.path.exists(backend_script):
                # Ghi log ra file server/backend.log để người dùng xem khi cần
                log_path = os.path.join("server", "backend.log")
                try:
                    self.log_file = open(log_path, "w", encoding="utf-8")
                except Exception:
                    self.log_file = subprocess.DEVNULL

                # Thiết lập môi trường không lưu đệm và mã hóa UTF-8 cho toàn bộ tiến trình con (bao gồm cả tiến trình reload của uvicorn)
                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"
                env["PYTHONIOENCODING"] = "utf-8"

                # Khởi chạy python trực tiếp với cờ -u (unbuffered) và biến môi trường
                self.proc_backend = subprocess.Popen(
                    [python_exe, "-u", "main.py"],
                    cwd="server",
                    env=env,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                    stdout=self.log_file,
                    stderr=self.log_file
                )
            
            # 3. Khởi động Web Server Frontend (Port 3000) bằng Python Thread (tức thì, không trễ Node.js)
            self.start_python_frontend_server()
            
            # Khởi chạy kiểm tra nhanh cổng ngay lập tức (mỗi 100ms) để bật trình duyệt siêu tốc
            self.safe_call(self.quick_check_startup)
            
        except Exception as e:
            # Hiển thị lỗi ra UI nếu không khởi động được
            self.safe_call(messagebox.showerror, "Lỗi khởi chạy", f"Không thể bật dịch vụ:\n{e}")
            self.safe_call(self.set_gui_stopped_state)

    def start_python_frontend_server(self):
        """Khởi động máy chủ HTTP tĩnh bằng Python Thread chạy cục bộ, mở cổng tức thì trong 5ms"""
        def serve():
            try:
                # Quét dọn trước để tránh xung đột cổng
                self.kill_process_on_port(PORT_FRONTEND)
                
                handler = NoCacheHTTPRequestHandler
                # Sử dụng ThreadingHTTPServer để phục vụ đa luồng mượt mà
                self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT_FRONTEND), handler)
                self.httpd.serve_forever()
            except Exception as e:
                print(f"[Error] Python Web Server failed to start: {e}")
                self.safe_call(messagebox.showerror, "Lỗi Web Server", f"Không thể bật máy chủ giao diện (Port {PORT_FRONTEND}):\n{e}\n\nHãy đảm bảo cổng này không bị ứng dụng khác chiếm dụng.")
                self.safe_call(self.set_gui_stopped_state)

        self.frontend_thread = threading.Thread(target=serve, daemon=True)
        self.frontend_thread.start()

    def quick_check_startup(self):
        """Kiểm tra nhanh cổng 3000 để mở trình duyệt ngay khi sẵn sàng (mỗi 100ms)"""
        if self.is_running and self.should_auto_open_browser:
            if self.check_port(PORT_FRONTEND):
                self.should_auto_open_browser = False
                webbrowser.open(f"http://127.0.0.1:{PORT_FRONTEND}")
            else:
                self.root.after(100, self.quick_check_startup)

    def stop_all_services(self):
        """Tắt tất cả tiến trình dịch vụ và dọn sạch cổng mạng"""
        # 1. Tắt các tiến trình con và máy chủ HTTP
        if self.proc_backend:
            self.proc_backend.terminate()
            self.proc_backend = None
        
        if hasattr(self, 'log_file') and self.log_file and self.log_file != subprocess.DEVNULL:
            try:
                self.log_file.close()
            except Exception:
                pass
            self.log_file = None
        
        # Tắt máy chủ HTTP Python
        if hasattr(self, 'httpd') and self.httpd:
            try:
                self.httpd.shutdown()
                self.httpd.server_close()
            except Exception:
                pass
            self.httpd = None

        # 2. Quét dọn nâng cao (Chạy cưỡng bức kill ports) để phòng ngừa xung đột
        if os.name == 'nt':  # Windows
            try:
                # Quét cổng 3000
                self.kill_process_on_port(PORT_FRONTEND)
                # Quét cổng 8000
                self.kill_process_on_port(PORT_BACKEND)
            except Exception as e:
                print(f"[Error] Loi dọn dep port: {e}")
                
        # Làm mới trạng thái GUI
        self.safe_call(self.set_gui_stopped_state)

    def kill_process_on_port(self, port):
        """Tìm và đóng toàn bộ tiến trình chiếm dụng port chỉ định trên Windows"""
        try:
            # Chạy lệnh netstat để lấy thông tin toàn bộ kết nối và lọc chính xác LISTENING port
            cmd = 'netstat -aon'
            res = subprocess.run(
                cmd, 
                shell=True, 
                capture_output=True, 
                text=True, 
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            output = res.stdout.strip()
            if not output:
                return

            my_pid = str(os.getpid())
            pids = set()
            for line in output.split('\n'):
                parts = line.split()
                # Dòng kết nối TCP trên Windows thường có 5 cột. Ví dụ:
                # TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       1234
                if len(parts) >= 5:
                    local_addr = parts[1]
                    state = parts[3]
                    pid = parts[4]
                    if state == "LISTENING" and local_addr.endswith(f":{port}"):
                        if pid.isdigit() and pid != '0' and pid != my_pid:
                            pids.add(pid)
            
            for pid in pids:
                # 1. Diệt tiến trình gốc (hoặc parent shell)
                subprocess.run(
                    f'taskkill /F /PID {pid}', 
                    shell=True, 
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                # 2. Tìm và diệt tất cả tiến trình con (phòng hờ trường hợp tiến trình cha đã chết nhưng con giữ cổng)
                wmic_cmd = f'wmic process where "ParentProcessId={pid}" get processid'
                child_res = subprocess.run(
                    wmic_cmd,
                    shell=True,
                    capture_output=True,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
                for line in child_res.stdout.split('\n'):
                    c_pid = line.strip()
                    if c_pid.isdigit():
                        subprocess.run(
                            f'taskkill /F /PID {c_pid}',
                            shell=True,
                            creationflags=subprocess.CREATE_NO_WINDOW,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL
                        )
        except Exception as e:
            print(f"[Warning] Khong the kill PID tren port {port}: {e}")

    def on_close(self):
        """Sự kiện khi tắt App - Bảo đảm toàn bộ dịch vụ chạy ngầm được dọn dẹp"""
        self.stop_monitor = True
        self.root.withdraw()  # Ẩn cửa sổ ngay để tạo cảm giác tắt nhanh chóng
        
        # Thực hiện dọn dẹp các tiến trình ngầm trước khi hủy cửa sổ hoàn toàn
        self.stop_all_services()
        self.root.destroy()
        sys.exit(0)

def setup_environment_if_needed(root):
    """Kiểm tra và tự động thiết lập môi trường ảo .venv cùng các thư viện nếu chạy lần đầu"""
    venv_python = os.path.join(".venv", "Scripts", "python.exe") if os.name == 'nt' else os.path.join(".venv", "bin", "python")
    if os.path.exists(venv_python):
        return True # Môi trường đã sẵn sàng

    # Tạo một cửa sổ tải nhỏ báo trạng thái
    loading = tk.Toplevel(root)
    loading.title("Cài đặt môi trường")
    
    # Tính toán DPI scale cho cửa sổ loading
    try:
        dpi = loading.winfo_fpixels('1i')
        dpi_scale = dpi / 96.0
    except Exception:
        dpi_scale = 1.0
        
    w_loading = int(380 * dpi_scale)
    h_loading = int(150 * dpi_scale)
    loading.geometry(f"{w_loading}x{h_loading}")
    loading.configure(bg=COLOR_BG_CARD)
    loading.resizable(False, False)
    
    # Căn giữa cửa sổ loading
    loading.update_idletasks()
    x = (loading.winfo_screenwidth() // 2) - (w_loading // 2)
    y = (loading.winfo_screenheight() // 2) - (h_loading // 2)
    loading.geometry(f'{w_loading}x{h_loading}+{x}+{y}')
    
    # Đóng nút X góc trên để bắt buộc người dùng chờ
    loading.protocol("WM_DELETE_WINDOW", lambda: None)
    
    lbl_title = tk.Label(
        loading, 
        text="Thiết lập môi trường chạy lần đầu...", 
        font=("Segoe UI", 11, "bold"), 
        bg=COLOR_BG_CARD, 
        fg=COLOR_TEXT_ACCENT
    )
    lbl_title.pack(pady=(20, 10))
    
    lbl_status = tk.Label(
        loading, 
        text="Đang tạo thư mục môi trường ảo (.venv)...", 
        font=("Segoe UI", 9), 
        bg=COLOR_BG_CARD, 
        fg=COLOR_TEXT_MUTED
    )
    lbl_status.pack(pady=5)
    
    success = [False]
    error_msg = [""]
    status_text = ["Đang tạo thư mục môi trường ảo (.venv)..."]
    done = [False]
    
    def run_setup():
        try:
            # 1. Tạo venv
            try:
                res = subprocess.run(
                    ["python", "-m", "venv", ".venv"],
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                    capture_output=True
                )
                if res.returncode != 0:
                    raise Exception("Không thể khởi tạo môi trường ảo bằng venv.")
            except FileNotFoundError:
                raise Exception("Không tìm thấy Python trên hệ thống. Vui lòng cài đặt Python và tích chọn 'Add Python to PATH' khi cài đặt.")
                
            # 2. Cài đặt các thư viện từ requirements.txt
            status_text[0] = "Đang cài đặt các thư viện cần thiết..."
            pip_exe = os.path.join(".venv", "Scripts", "pip.exe") if os.name == 'nt' else os.path.join(".venv", "bin", "pip")
            req_file = os.path.join("server", "requirements.txt")
            
            if os.path.exists(req_file):
                res = subprocess.run(
                    [pip_exe, "install", "-r", req_file],
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                    capture_output=True
                )
                if res.returncode != 0:
                    err_desc = res.stderr.decode('utf-8', errors='ignore')
                    raise Exception(f"Lỗi cài đặt thư viện:\n{err_desc}")
            
            success[0] = True
        except Exception as e:
            error_msg[0] = str(e)
        finally:
            done[0] = True

    # Chạy Setup trong thread riêng để giao diện không bị treo đơ
    threading.Thread(target=run_setup, daemon=True).start()
    
    def check_status():
        # Cập nhật chữ trạng thái trên main thread
        if lbl_status["text"] != status_text[0]:
            lbl_status.configure(text=status_text[0])
        
        if done[0]:
            loading.destroy()
        else:
            root.after(100, check_status)
            
    # Bắt đầu vòng lặp kiểm tra trạng thái trên main thread
    root.after(100, check_status)
    
    # Đợi cho đến khi cửa sổ loading đóng hoàn toàn
    root.wait_window(loading)
    
    if not success[0]:
        messagebox.showerror("Lỗi thiết lập", f"Không thể tự động thiết lập môi trường:\n{error_msg[0]}")
        return False
    return True

# Khởi chạy ứng dụng
if __name__ == "__main__":
    # Bật hỗ trợ hiển thị màn hình độ phân giải cao High DPI (tránh lỗi giao diện bị mờ/fuzzy trên Windows)
    if os.name == 'nt':
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1) # Cho Win 8.1 trở lên
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware() # Cho Win 7 trở xuống
            except Exception:
                pass

    # Đặt thư mục làm việc hiện tại là thư mục chứa file app này (hoặc thư mục chứa file EXE)
    if getattr(sys, 'frozen', False):
        script_dir = os.path.dirname(sys.executable)
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    root = tk.Tk()
    root.withdraw() # Ẩn cửa sổ chính trắng tinh đi trong lúc cài đặt
    
    # Tự động cài đặt nếu chạy lần đầu, sau đó mới bật App chính
    if setup_environment_if_needed(root):
        root.deiconify() # Hiện lại cửa sổ chính khi ứng dụng sẵn sàng
        app = SmartHospitalManagerApp(root)
        root.mainloop()
    else:
        root.destroy()
