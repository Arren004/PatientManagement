from rosbridge_client import connect_mqtt
import json

def publish_speed_to_mqtt(client, robot_id, speed):
    topic = f"/robots/{robot_id}/speed"
    payload = json.dumps({"speed": speed})
    result = client.publish(topic, payload)
    if result[0] == 0:
        print(f"[MQTT] Sent `{payload}` to topic `{topic}`")
    else:
        print(f"[MQTT] Failed to send message to topic {topic}")
import time
from firebase_client import db

ROBOT_ID = "no.1_1774876521539"  # Thay bằng robot_id của bạn
POLL_INTERVAL = 3  # Thời gian kiểm tra lại (giây)

def get_speed_from_firestore(robot_id):
    doc_ref = db.collection('robots').document(robot_id)
    doc = doc_ref.get()
    if doc.exists:
        return doc.to_dict().get("speed")
    return None

def main():
    last_speed = None
    print(f"[POLL] Bắt đầu theo dõi speed robot {ROBOT_ID}. Nhấn Ctrl+C để dừng.")
    client = connect_mqtt()
    try:
        while True:
            speed = get_speed_from_firestore(ROBOT_ID)
            if speed != last_speed and speed is not None:
                print(f"[POLL] Speed thay đổi: {last_speed} -> {speed}")
                publish_speed_to_mqtt(client, ROBOT_ID, speed)
                last_speed = speed
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print("\n[POLL] Đã dừng polling.")
        client.disconnect()

if __name__ == "__main__":
    main()
