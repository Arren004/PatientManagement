import threading
import time
from firebase_client import db
from datetime import datetime
from models import Baterryupdate
from models import SpeedUpdateModel
from fastapi import APIRouter, HTTPException
import rosbridge_client as mqtt
import json
router = APIRouter()

def update_battery_firestore(robot_id: str, battery_level: int):
    doc_ref = db.collection('robots').document(robot_id)
    doc = doc_ref.get()
    if not doc.exists:
        print(f"Robot {robot_id} not found in Firestore")
        return False
    battery_status = "normal"
    if battery_level < 20:
        battery_status = "low"
    doc_ref.update({
        "battery": battery_level,
        "battery_status": battery_status,
        "updatedAt": datetime.now().isoformat()
    })
    print(f"Updated Firestore for robot {robot_id} with battery {battery_level}")
    return True

def subscribe_battery(client: mqtt.mqtt_client):
    def on_message(client, userdata, msg):
        print(f"Received `{msg.payload.decode()}` from `{msg.topic}` topic")
        try:
            topic_parts = msg.topic.split("/")
            robot_id = topic_parts[2] if len(topic_parts) > 2 else None
            data = json.loads(msg.payload.decode())
            battery_level = data.get("battery_level")
            if robot_id and battery_level is not None:
                update_battery_firestore(robot_id, battery_level)
            else:
                print("Invalid message format or missing robot_id/battery_level")
        except Exception as e:
            print(f"Error processing MQTT message: {e}")

    client.subscribe("/robots/+/battery")
    client.on_message = on_message
def get_speed_from_firestore(robot_id):
    doc_ref = db.collection('robots').document(robot_id)
    doc = doc_ref.get()
    if doc.exists:
        return doc.to_dict().get("speed")
    return None
def publish_speed_to_mqtt(client, robot_id, speed):
    topic = f"/robots/{robot_id}/speed"
    payload = json.dumps({"speed": speed})
    result = client.publish(topic, payload)
    if result[0] == 0:
        print(f"[MQTT] Sent `{payload}` to topic `{topic}`")
    else:
        print(f"[MQTT] Failed to send message to topic {topic}")

def speed_watcher(robot_id, client, poll_interval=3):
    last_speed = None
    print(f"[SPEED WATCHER] Watching speed for robot {robot_id}")
    while True:
        speed = get_speed_from_firestore(robot_id)
        if speed != last_speed and speed is not None:
            print(f"[SPEED WATCHER] Speed changed: {last_speed} -> {speed}")
            publish_speed_to_mqtt(client, robot_id, speed)
            last_speed = speed
        time.sleep(poll_interval)

def start_speed_watcher(robot_id, client):
    t = threading.Thread(target=speed_watcher, args=(robot_id, client), daemon=True)
    t.start()
@router.post("/robots/{robot_id}/battery")
async def update_battery(robot_id: str, battery_update: Baterryupdate):
    # Kiểm tra robot tồn tại và cập nhật Firestore
    ok = update_battery_firestore(robot_id, battery_update.battery_level)
    if not ok:
        raise HTTPException(status_code=404, detail="Robot not found")
    return {"message": "Battery updated", "robot_id": robot_id, "battery": battery_update.battery_level}

