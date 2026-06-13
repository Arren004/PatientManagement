import paho.mqtt.client as mqtt
import threading
import time
import json
import queue


BROKER = "broker.emqx.io"  # Sử dụng broker EMQX giống backend
PORT = 1883
ROBOT_ID = "1"  # Thay bằng robotId thực tế của bạn (ví dụ: '1')
TOPIC_DELIVERY = f"/robots/{ROBOT_ID}/delivery"
TOPIC_SPEED = f"/robots/{ROBOT_ID}/speed"
BATTERY_TOPIC = f"/robots/{ROBOT_ID}/battery"
DELIVERED_TOPIC = f"/robots/{ROBOT_ID}/delivered"

# Danh sách các docId đã gặp theo thứ tự để phân biệt đơn 1 và đơn 2
seen_doc_ids = []

# Queue chứa tuple: (doc_id, slot, status, reason)
delivery_queue = queue.Queue()

def on_connect(client, userdata, flags, rc):
    print("Connected with result code " + str(rc))
    client.subscribe(TOPIC_DELIVERY)
    print(f"Subscribed to {TOPIC_DELIVERY}")
    client.subscribe(TOPIC_SPEED)
    print(f"Subscribed to {TOPIC_SPEED}")
    client.subscribe(BATTERY_TOPIC)
    print(f"Subscribed to {BATTERY_TOPIC}")
    # Bắt đầu worker thread gửi phản hồi
    threading.Thread(target=delivery_feedback_worker, args=(client, ROBOT_ID), daemon=True).start()

def delivery_feedback_worker(client, robot_id):
    while True:
        doc_id, slot, status, reason = delivery_queue.get()
        print(f"[DEBUG] Đợi 5 giây trước khi phản hồi cho docId={doc_id}, slot={slot}...")
        time.sleep(5)
        
        feedback = {
            "docId": doc_id,
            "status": status,
            "slot": slot
        }
        if status == "failed":
            feedback["reason"] = reason
            
        payload = json.dumps(feedback)
        topic = f"/robots/{robot_id}/delivered"
        client.publish(topic, payload)
        print(f"[{status.upper()}] Đã gửi phản hồi: {payload} tới topic {topic}")

def on_message(client, userdata, msg):
    global seen_doc_ids
    if msg.topic == TOPIC_DELIVERY:
        payload_str = msg.payload.decode()
        print(f"\n[DELIVERY] Nhận lệnh giao hàng: {payload_str}")
        try:
            raw_data = json.loads(payload_str)
            # Mở bọc envelope từ backend nếu có
            data = raw_data.get("data") if isinstance(raw_data, dict) and "data" in raw_data else raw_data
            
            doc_id = data.get("docId")
            if not doc_id:
                print("[WARNING] Gói tin không chứa docId!")
                return
                
            slot = data.get("slot")
            if slot is None:
                print("[WARNING] Gói tin không chứa slot!")
                return

            # Xác định đơn thứ mấy dựa trên thứ tự của docId
            if doc_id not in seen_doc_ids:
                seen_doc_ids.append(doc_id)
                
            order_index = seen_doc_ids.index(doc_id) + 1 # Đơn số 1, số 2,...
            
            if order_index == 1:
                status = "delivered"
                reason = ""
                print(f"[KỊCH BẢN] Đơn hàng ĐẦU TIÊN (docId={doc_id}) -> Giả lập THÀNH CÔNG (delivered) cho khay {slot}")
            elif order_index == 2:
                status = "failed"
                reason = "timeout"
                print(f"[KỊCH BẢN] Đơn hàng THỨ 2 (docId={doc_id}) -> Giả lập THẤT BẠI (failed, lý do: {reason}) cho khay {slot}")
            else:
                status = "delivered"
                reason = ""
                print(f"[KỊCH BẢN] Đơn hàng thứ {order_index} (docId={doc_id}) -> Mặc định THÀNH CÔNG cho khay {slot}")
                
            delivery_queue.put((doc_id, slot, status, reason))
            
        except Exception as e:
            print(f"[ERROR] Lỗi phân tích gói tin: {e}")
    elif msg.topic == TOPIC_SPEED:
        print(f"[SPEED] {msg.payload.decode()}")
    elif msg.topic == BATTERY_TOPIC:
        print(f"[BATTERY] {msg.payload.decode()}")
    else:
        print(f"[OTHER] {msg.topic}: {msg.payload.decode()}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message

client.connect(BROKER, PORT, 60)
client.loop_forever()