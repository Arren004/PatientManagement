import threading
import time
from typing import Optional, Tuple
from utils import safe_print as print
from db_client import db
from datetime import datetime
from models import Baterryupdate
from fastapi import APIRouter, HTTPException
import rosbridge_client as mqtt
import json
from mqtt_contract import (
    QOS_COMMAND,
    QOS_TELEMETRY,
    envelope,
    topic_battery,
    topic_heartbeat,
    topic_speed,
    topic_state,
)
from mqtt_utils import publish_with_retry

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
        "updatedAt": datetime.now().isoformat(),
        "online": True,
        "lastSeenAt": datetime.now().isoformat()
    })
    print(f"Updated Firestore for robot {robot_id} with battery {battery_level}")
    return True

def _mark_robot_online(robot_id: str):
    doc_ref = db.collection('robots').document(robot_id)
    doc_ref.set(
        {
            "online": True,
            "lastSeenAt": datetime.now().isoformat(),
        },
        merge=True,
    )


def subscribe_battery(client: mqtt.mqtt_client):
    def process_msg(msg):
        print(f"Received `{repr(msg.payload.decode(errors='ignore'))}` from `{msg.topic}` topic")
        try:
            topic_parts = msg.topic.split("/")
            robot_id = topic_parts[2] if len(topic_parts) > 2 else None
            data = json.loads(msg.payload.decode())
            if isinstance(data, dict) and "data" in data:
                data = data.get("data") or {}
            battery_level = data.get("battery_level")
            if robot_id and battery_level is not None:
                update_battery_firestore(robot_id, battery_level)
            else:
                print("Invalid message format or missing robot_id/battery_level")
        except Exception as e:
            print(f"Error processing MQTT message: {repr(e)}")

    def on_message(client, userdata, msg):
        threading.Thread(target=process_msg, args=(msg,), daemon=True).start()

    client.subscribe("/robots/+/battery", qos=QOS_TELEMETRY)
    client.message_callback_add("/robots/+/battery", on_message)


def subscribe_robot_state(client: mqtt.mqtt_client):
    def process_state(msg):
        try:
            topic_parts = msg.topic.split("/")
            robot_id = topic_parts[2] if len(topic_parts) > 2 else None
            if not robot_id:
                return

            payload = json.loads(msg.payload.decode())
            data = payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
            if not isinstance(data, dict):
                data = {"state": str(data)}

            db.collection('robots').document(robot_id).set(
                {
                    "state": data,
                    "online": True,
                    "lastSeenAt": datetime.now().isoformat(),
                },
                merge=True,
            )
        except Exception as e:
            print(f"Error processing robot state: {repr(e)}")

    def on_state(client, userdata, msg):
        threading.Thread(target=process_state, args=(msg,), daemon=True).start()

    client.subscribe("/robots/+/state", qos=QOS_TELEMETRY)
    client.message_callback_add("/robots/+/state", on_state)


def _velocity_from_robot_dict(d: dict) -> Optional[Tuple[float, float]]:
    """Trả về (v, w) từ Firestore; hỗ trợ robot cũ chỉ có speed 0–100."""
    if not isinstance(d, dict):
        return None
    v_raw, w_raw = d.get("v"), d.get("w")
    if v_raw is not None or w_raw is not None:
        try:
            fv = float(v_raw) if v_raw is not None else 0.0
            fw = float(w_raw) if w_raw is not None else 0.0
        except (TypeError, ValueError):
            return None
        return (fv, fw)
    legacy = d.get("speed")
    if legacy is not None:
        try:
            s = float(legacy)
        except (TypeError, ValueError):
            return None
        return ((s / 100.0) * 2.0, (s / 100.0) * 4.0)
    return None


def get_velocity_from_firestore(robot_id):
    doc_ref = db.collection("robots").document(robot_id)
    doc = doc_ref.get()
    if not doc.exists:
        return None
    return _velocity_from_robot_dict(doc.to_dict() or {})


def publish_velocity_to_mqtt(client, robot_id, v: float, w: float):
    topic = topic_speed(robot_id)
    payload = json.dumps(
        envelope(
            "robot.speed.command",
            {"robotId": robot_id, "v": v, "w": w},
        ),
        ensure_ascii=False,
    )
    ok = publish_with_retry(client, topic, payload, qos=QOS_COMMAND, retries=3)
    if ok:
        print(f"[MQTT] Sent `{payload}` to topic `{topic}`")
    else:
        print(f"[MQTT] Failed to send message to topic {topic}")


def speed_watcher(robot_id, client, poll_interval=3):
    last_key = None
    is_first_run = True
    print(f"[SPEED WATCHER] Watching v,w for robot {robot_id}")
    while True:
        pair = get_velocity_from_firestore(robot_id)
        if pair is not None:
            fv, fw = pair
            key = (round(fv, 4), round(fw, 4))
            if is_first_run:
                last_key = key
                is_first_run = False
                print(f"[SPEED WATCHER] Initial velocity recorded for robot {robot_id}: {key}")
            elif key != last_key:
                print(f"[SPEED WATCHER] Velocity changed: {last_key} -> {key}")
                publish_velocity_to_mqtt(client, robot_id, fv, fw)
                last_key = key
        time.sleep(poll_interval)

def start_speed_watcher(robot_id, client):
    t = threading.Thread(target=speed_watcher, args=(robot_id, client), daemon=True)
    t.start()


def heartbeat_publisher(robot_id, client, interval=10):
    topic = topic_heartbeat(robot_id)
    while True:
        payload = json.dumps(envelope("backend.heartbeat", {"robotId": robot_id}), ensure_ascii=False)
        publish_with_retry(client, topic, payload, qos=QOS_TELEMETRY, retries=2)
        time.sleep(interval)


def start_backend_heartbeat_publisher(robot_id, client, interval=10):
    t = threading.Thread(target=heartbeat_publisher, args=(robot_id, client, interval), daemon=True)
    t.start()


@router.post("/robots/{robot_id}/battery")
async def update_battery(robot_id: str, battery_update: Baterryupdate):
    # Kiểm tra robot tồn tại và cập nhật Firestore
    ok = update_battery_firestore(robot_id, battery_update.battery_level)
    if not ok:
        raise HTTPException(status_code=404, detail="Robot not found")
    return {"message": "Battery updated", "robot_id": robot_id, "battery": battery_update.battery_level}

