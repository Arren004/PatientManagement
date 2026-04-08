# Lộ trình học giao tiếp ROS2 - MQTT - Web

## 1. Nền tảng cơ bản
- Hiểu kiến trúc client-server, giao thức HTTP, MQTT.
- Cài đặt Python, pip, ROS2 (trên Raspberry Pi), Mosquitto MQTT broker.

## 2. ROS2 trên Raspberry Pi
- Cài đặt ROS2 trên Raspberry Pi.
- Viết node ROS2 bằng Python để lấy dữ liệu pin.
- Cài đặt và sử dụng thư viện paho-mqtt để publish dữ liệu lên MQTT broker.

## 3. MQTT Broker
- Cài đặt Mosquitto broker (trên Pi, PC hoặc dùng broker cloud/public).
- Kiểm tra publish/subscribe bằng tool (MQTT Explorer, mosquitto_sub/pub).

## 4. Server nhận dữ liệu từ MQTT
- Viết Python client (paho-mqtt) trên server để subscribe topic pin robot.
- Khi nhận được dữ liệu, lưu vào Firestore hoặc database.

## 5. Web realtime
- Web lấy dữ liệu từ Firestore (hoặc database) và hiển thị realtime (như hiện tại).
- Tối ưu UI/UX cảnh báo pin yếu, hiệu ứng realtime.

## 6. Mở rộng
- Gửi lệnh từ web xuống robot qua MQTT (2 chiều).
- Bảo mật MQTT (username/password, TLS).
- Quản lý nhiều robot, nhiều loại dữ liệu.

---

**Ghi chú:**
- Có thể học từng bước, kiểm tra từng phần độc lập.
- Ưu tiên hiểu rõ từng thành phần trước khi tích hợp toàn hệ thống.
