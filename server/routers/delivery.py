# --- DELIVERY FIRESTORE WATCHER & MQTT PUBLISH ---
import datetime
import json
from operator import index
import threading
from utils import safe_print as print

from db_client import db
from mqtt_contract import QOS_COMMAND, topic_delivered, topic_delivery, envelope
from mqtt_utils import publish_with_retry


def clean_dict(obj):
    if isinstance(obj, dict):
        return {k: clean_dict(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_dict(i) for i in obj]
    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    return obj


def _build_delivery_payload(robot_id, doc_id, data):
    payload = {
        "name": data.get("patientName") or data.get("name"),
        "bed": data.get("bed"),
        "room": data.get("room"),
        "position": data.get("position"),
        "note": data.get("note"),
        "robotId": robot_id,
    }
    if doc_id:
        payload["docId"] = doc_id
    slot = data.get("slot")
    if slot is not None:
        payload["slot"] = slot
    return clean_dict(payload)


def publish_delivery_to_mqtt(client, robot_id, delivery_data):
    topic = topic_delivery(robot_id)

    bins = delivery_data.get("bins")
    robot_id = delivery_data.get("robotId")
    doc_id = delivery_data.get("docId") if "docId" in delivery_data else delivery_data.get("id")

    if isinstance(bins, list) and bins:
        for bin_item in bins:
            body = _build_delivery_payload(robot_id, doc_id, bin_item)
            wrapped = envelope("delivery.command", body)
            payload = json.dumps(wrapped, ensure_ascii=False)
            ok = publish_with_retry(client, topic, payload, qos=QOS_COMMAND, retries=3)
            if ok:
                print(f"[MQTT] Sent `{payload}` to topic `{topic}`")
            else:
                print(f"[MQTT] Failed to send message to topic {topic}")
        return

    body = _build_delivery_payload(robot_id, doc_id, delivery_data)
    wrapped = envelope("delivery.command", body)
    payload = json.dumps(wrapped, ensure_ascii=False)
    ok = publish_with_retry(client, topic, payload, qos=QOS_COMMAND, retries=3)
    if ok:
        print(f"[MQTT] Sent `{payload}` to topic `{topic}`")
    else:
        print(f"[MQTT] Failed to send message to topic {topic}")


def publish_open_lid_to_mqtt(client, robot_id, delivery_data):
    topic = topic_delivery(robot_id)
    bins = delivery_data.get("bins")
    doc_id = delivery_data.get("docId") if "docId" in delivery_data else delivery_data.get("id")

    if isinstance(bins, list) and bins:
        for bin_item in bins:
            body = {
                "robotId": robot_id,
                "slot": bin_item.get("slot"),
                "docId": doc_id,
                "action": "open_lid"
            }
            wrapped = envelope("robot.open_lid", body)
            payload = json.dumps(wrapped, ensure_ascii=False)
            ok = publish_with_retry(client, topic, payload, qos=QOS_COMMAND, retries=3)
            if ok:
                print(f"[MQTT] Sent open_lid `{payload}` to topic `{topic}`")
            else:
                print(f"[MQTT] Failed to send open_lid to topic {topic}")


def on_delivery_snapshot(col_snapshot, changes, read_time, client):
    for change in changes:
        if change.type.name == "ADDED":
            doc = change.document
            data = doc.to_dict()
            if data.get("status") == "delivered":
                print(f"[WATCHER] Skipping order {doc.id} because it was already delivered.")
                continue
            robot_id = data.get("robotId")
            if robot_id:
                data["docId"] = doc.id
                if data.get("status") == "open_lid":
                    publish_open_lid_to_mqtt(client, robot_id, data)
                    db.collection("deliveryCommands").document(doc.id).update({"status": "delivered"})
                else:
                    publish_delivery_to_mqtt(client, robot_id, data)
            else:
                print(f"[WATCHER] Order {doc.id} has no robotId!")


def start_delivery_command_watcher(client):
    print("[WATCHER] Start watching for new orders...")
    col_query = (
    db.collection("deliveryCommands")
    .where("status", "!=", "delivered")
    )

    def _watch():
        col_query.on_snapshot(lambda snap, changes, t: on_delivery_snapshot(snap, changes, t, client))

    threading.Thread(target=_watch, daemon=True).start()


feedback_lock = threading.Lock()

# --- SỬA ĐỔI: SUBSCRIBE PHẢN HỒI DELIVERY TỪ ROBOT (Hỗ trợ xử lý giao thất bại) ---
def on_robot_feedback(client, userdata, msg):
    def process_feedback():
        try:
            data = json.loads(msg.payload.decode())
            payload = data.get("data") if isinstance(data, dict) and "data" in data else data
            doc_id = payload.get("docId") if isinstance(payload, dict) else None
            slot = payload.get("slot") if isinstance(payload, dict) else None
            status = payload.get("status") if isinstance(payload, dict) else None
            reason = payload.get("reason") if isinstance(payload, dict) else ""
            print(f"Robot feedback: docId={doc_id}, slot={slot}, status={status}, reason={repr(reason)}")

            if doc_id is not None and slot is not None and status in ["delivered", "failed"]:
                with feedback_lock:
                    doc_ref = db.collection("deliveryCommands").document(doc_id)
                    doc = doc_ref.get()
                    if doc.exists:
                        doc_data = doc.to_dict()
                        bins = doc_data.get("bins", [])
                        for bin_item in bins:
                            if bin_item.get("slot") == slot:
                                bin_item["status"] = status
                                if status == "failed":
                                    bin_item["failureReason"] = reason
                        
                        updates = {"bins": bins}

                        # Kiểm tra xem toàn bộ các ngăn trong ca giao đã hoàn thành xử lý (đã giao hoặc thất bại) chưa
                        if bins and all(bin_item.get("status") in ["delivered", "failed"] for bin_item in bins):
                            # Nếu có bất kỳ ngăn nào bị thất bại, cập nhật trạng thái chung là failed để giải phóng hệ thống
                            has_failed = any(bin_item.get("status") == "failed" for bin_item in bins)
                            final_status = "failed" if has_failed else "delivered"
                            updates["status"] = final_status

                        success = doc_ref.update(updates)
                        print(f"Updated document {doc_id} with updates {json.dumps(updates, ensure_ascii=False)}. Success: {success}")
        except Exception as e:
            print("Error processing robot feedback:", repr(e))

    threading.Thread(target=process_feedback, daemon=True).start()
# --- KẾT THÚC SỬA ĐỔI ---


def start_robot_feedback_subscriber(client, robot_id):
    topic = topic_delivered(robot_id)
    client.subscribe(topic)
    client.message_callback_add(topic, on_robot_feedback)
    print(f"[MQTT] Subscribed to {topic} for robot feedback")
