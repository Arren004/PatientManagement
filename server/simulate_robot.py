import json
import time
import random
from paho.mqtt import client as mqtt_client
from utils import safe_print as print

BROKER = "broker.emqx.io"
PORT = 1883

def connect_mqtt():
    client_id = f"sim-robot-{random.randint(1000, 9999)}"
    client = mqtt_client.Client(client_id=client_id)
    
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("[MQTT] Kết nối thành công tới broker!")
            # Subscribe to all robot delivery topics
            client.subscribe("/robots/+/delivery")
            print("[MQTT] Đã đăng ký lắng nghe topic: /robots/+/delivery")
        else:
            print(f"[MQTT] Kết nối thất bại, mã lỗi: {rc}")
            
    client.on_connect = on_connect
    client.connect(BROKER, PORT)
    return client

def on_message(client, userdata, msg):
    # Topic format: /robots/{robot_id}/delivery
    parts = msg.topic.split("/")
    if len(parts) < 4:
        return
    robot_id = parts[2]
    
    raw_payload = msg.payload.decode(errors="ignore")
    print(f"\n=========================================")
    print(f"[NHẬN LỆNH] Nhận yêu cầu giao thuốc cho robot: '{robot_id}'")
    print(f"Topic: {msg.topic}")
    
    try:
        raw_data = json.loads(raw_payload)
        
        # Hỗ trợ giải nén payload bọc trong CloudEvents envelope (chứa trường "data" ở lớp ngoài)
        if "data" in raw_data and isinstance(raw_data["data"], dict) and ("schemaVersion" in raw_data or "eventType" in raw_data):
            payload = raw_data["data"]
        else:
            payload = raw_data
            
        doc_id = payload.get("docId") or payload.get("_id")
        bins = payload.get("bins", [])
        
        # Nếu payload là cấu trúc giao đơn lẻ (không chứa mảng "bins" ví dụ luồng cũ)
        if not bins and (payload.get("slot") is not None or payload.get("room") is not None):
            bins = [{
                "slot": payload.get("slot"),
                "patientName": payload.get("name") or payload.get("patientName") or "Không rõ",
                "room": payload.get("room") or "—",
                "bed": payload.get("bed") or "—"
            }]
        
        if not doc_id:
            print("[CẢNH BÁO] Không tìm thấy docId trong payload!")
            return
            
        print(f"Mã đơn giao (docId): {doc_id}")
        print(f"Danh sách các ngăn:")
        for b in bins:
            slot = b.get("slot")
            patient = b.get("patientName") or b.get("name") or "Không rõ"
            room = b.get("room") or "—"
            bed = b.get("bed") or "—"
            print(f"  - Ngăn {slot}: Bệnh nhân '{patient}', Phòng {room}, Giường {bed}")
            
        # Hỏi người dùng cho từng ngăn
        for b in bins:
            slot = b.get("slot")
            patient = b.get("patientName") or b.get("name") or "Không rõ"
            print(f"\n---> Cấu hình kết quả cho Ngăn {slot} (Bệnh nhân: {patient}):")
            print("  [1] Thành công (delivered)")
            print("  [2] Thất bại - Quá thời gian chờ (timeout)")
            print("  [3] Thất bại - Lỗi di chuyển (navigation_error)")
            print("  [4] Thất bại - Robot gặp sự cố khác")
            
            choice = ""
            while choice not in ["1", "2", "3", "4"]:
                choice = input("Nhập lựa chọn của bạn (1-4): ").strip()
                
            status = "delivered" if choice == "1" else "failed"
            reason = ""
            if choice == "2":
                reason = "timeout"
            elif choice == "3":
                reason = "navigation_error"
            elif choice == "4":
                reason = "other_error"
                
            feedback = {
                "docId": doc_id,
                "slot": slot,
                "status": status
            }
            if status == "failed":
                feedback["reason"] = reason
                
            # Đợi 0.2 giây giả lập thời gian robot xử lý/di chuyển
            print(f"[GIẢ LẬP] Đang xử lý ngăn {slot} trong 0.2 giây...")
            time.sleep(0.2)
            
            feedback_topic = f"/robots/{robot_id}/delivered"
            client.publish(feedback_topic, json.dumps(feedback, ensure_ascii=False))
            print(f"[GỬI PHẢN HỒI] Đã gửi tới {feedback_topic}:")
            print(json.dumps(feedback, ensure_ascii=False, indent=2))
            
        print("=========================================\n")
        print("Đang chờ lệnh tiếp theo...")
        
    except Exception as e:
        print(f"[LỖI] Xử lý payload gặp lỗi: {e}")
        print(f"Payload thô: {raw_payload}")

def main():
    print("=========================================")
    print("    CHƯƠNG TRÌNH GIẢ LẬP ROBOT GIAO THUỐC")
    print("=========================================")
    print(f"Broker: {BROKER}:{PORT}")
    print("Chương trình sẽ tự động lắng nghe lệnh từ Web và hỏi kết quả giao hàng.")
    print("-----------------------------------------")
    
    client = connect_mqtt()
    client.on_message = on_message
    
    client.loop_start()
    
    print("Đang chạy... Nhấn Ctrl+C để dừng chương trình.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nĐã dừng chương trình giả lập.")
    finally:
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    main()
