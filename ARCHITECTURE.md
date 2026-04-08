// ============================================
// CLEAN ARCHITECTURE - CẤU TRÚC DỰ ÁN
// ============================================

# 📁 Cấu Trúc Thư Mục

```
project/
├── js/
│   ├── data/                 # 📊 Dữ liệu (constants, models)
│   │   └── constants.js      # Hằng số, default state
│   │
│   ├── services/             # 🔧 Services (business logic)
│   │   ├── stateService.js   # Quản lý state global
│   │   ├── authService.js    # Authentication & authorization
│   │   ├── patientService.js # CRUD bệnh nhân
│   │   ├── nurseService.js   # CRUD y tá
│   │   ├── deliveryService.js # Quản lý ngăn thuốc
│   │   ├── robotService.js   # Thông tin robot
│   │   └── logService.js     # Quản lý logs
│   │
│   ├── views/                # 🎨 Views (UI rendering only)
│   │   ├── loginView.js      # Login screen
│   │   ├── menuView.js       # Menu navigation
│   │   ├── patientView.js    # Patient list UI
│   │   ├── nurseView.js      # Nurse list UI
│   │   ├── robotView.js      # Robot list UI
│   │   ├── deliveryView.js   # Delivery UI
│   │   └── logsView.js       # Logs UI
│   │
│   ├── controllers/          # 🎮 Controllers (event handlers)
│   │   ├── appController.js  # Main app orchestration
│   │   ├── patientController.js
│   │   ├── nurseController.js
│   │   ├── robotController.js
│   │   ├── deliveryController.js
│   │   └── logsController.js
│   │
│   ├── utils/                # 🛠️ Utilities
│   │   ├── formatter.js      # Format functions (date, status, etc.)
│   │   └── ui.js             # Toast, modal helpers
│   │
│   └── index.js              # 📍 Entry point
│
├── index.html                # HTML template
├── styles.css                # Styles
├── image/                    # Images
└── README.md                 # This file
```
