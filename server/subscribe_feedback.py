import json
import random
import time
from paho.mqtt import client as mqtt_client

BROKER = "broker.emqx.io"
PORT = 1883
# Lắng nghe phản hồi từ toàn bộ robot (dùng dấu + làm wildcard cho robotId)
TOPIC = "/robots/+/delivered"

def connect_mqtt():
    client_id = f"sub-monitor-{random.randint(1000, 9999)}"
    client = mqtt_client.Client(client_id=client_id)
    
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("[MQTT] Kết nối thành công tới broker!")
            client.subscribe(TOPIC)
            print(f"[MQTT] Đang lắng nghe trên topic: {TOPIC}")
        else:
            print(f"[MQTT] Kết nối thất bại, mã lỗi: {rc}")
            
    client.on_connect = on_connect
    client.connect(BROKER, PORT)
    return client

def on_message(client, userdata, msg):
    raw_payload = msg.payload.decode(errors="ignore")
    print(f"\n-----------------------------------------")
    print(f"[NHẬN PHẢN HỒI] Từ Robot qua topic: {msg.topic}")
    
    try:
        # Giải mã JSON và in ra tiếng Việt đẹp mắt
        data = json.loads(raw_payload)
        print("Nội dung tin nhắn (JSON):")
        print(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception:
        print(f"Nội dung thô (không phải JSON): {raw_payload}")
    print(f"-----------------------------------------")

def main():
    print("=========================================")
    print("  CHƯƠNG TRÌNH LẮNG NGHE PHẢN HỒI ROBOT")
    print("=========================================")
    print(f"Broker: {BROKER}:{PORT}")
    print(f"Đang kết nối để lắng nghe feedback...")
    
    client = connect_mqtt()
    client.on_message = on_message
    
    # Chạy vòng lặp nhận tin nhắn ngầm
    client.loop_start()
    
    print("Đang chạy... Nhấn Ctrl+C để dừng.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nĐã dừng chương trình lắng nghe.")
    finally:
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    main()
