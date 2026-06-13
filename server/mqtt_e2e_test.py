import argparse
import json
import random
import time

from paho.mqtt import client as mqtt_client


def parse_args():
    parser = argparse.ArgumentParser(description="MQTT E2E test for Smart Hospital topics")
    parser.add_argument("--broker", default="broker.emqx.io")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--robot-id", default="robot_01")
    parser.add_argument(
        "--mode",
        choices=["backend-command", "robot-feedback", "robot-battery", "robot-state", "listen"],
        default="backend-command",
    )
    parser.add_argument("--listen-topic", default="/robots/+/+")
    return parser.parse_args()


def envelope(event_type: str, source: str, data: dict):
    return {
        "schemaVersion": "1.0",
        "eventType": event_type,
        "source": source,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "data": data,
    }


def publish_json(client, topic: str, payload: dict):
    raw = json.dumps(payload, ensure_ascii=False)
    result = client.publish(topic, raw, qos=1)
    if result[0] == 0:
        print(f"[OK] Published -> {topic}\n{raw}")
    else:
        print(f"[ERROR] Publish failed rc={result[0]} topic={topic}")


def main():
    args = parse_args()

    client_id = f"mqtt-e2e-{random.randint(1000, 9999)}"
    client = mqtt_client.Client(client_id=client_id)

    def on_connect(c, userdata, flags, rc):
        print(f"Connected rc={rc}")
        if args.mode == "listen":
            c.subscribe(args.listen_topic, qos=1)
            print(f"Subscribed {args.listen_topic}")

    def on_message(c, userdata, msg):
        print(f"[MSG] {msg.topic}: {msg.payload.decode(errors='ignore')}")

    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(args.broker, args.port)
    client.loop_start()
    time.sleep(0.3)

    rid = args.robot_id

    if args.mode == "backend-command":
        topic = f"/robots/{rid}/delivery"
        payload = envelope(
            "delivery.command",
            "backend",
            {
                "docId": "demo-doc-001",
                "robotId": rid,
                "slot": 1,
                "name": "Test Patient",
                "room": "101",
                "bed": "Giường 1",
                "position": {"x": 1.0, "y": 2.0, "theta": 0.0},
                "note": "Sau ăn",
            },
        )
        publish_json(client, topic, payload)

    elif args.mode == "robot-feedback":
        topic = f"/robots/{rid}/delivered"
        payload = envelope(
            "delivery.feedback",
            "robot",
            {
                "docId": "demo-doc-001",
                "slot": 1,
                "status": "delivered",
            },
        )
        publish_json(client, topic, payload)

    elif args.mode == "robot-battery":
        topic = f"/robots/{rid}/battery"
        payload = envelope("robot.battery", "robot", {"battery_level": 78})
        publish_json(client, topic, payload)

    elif args.mode == "robot-state":
        topic = f"/robots/{rid}/state"
        payload = envelope(
            "robot.state",
            "robot",
            {
                "mode": "navigating",
                "currentTask": "delivery",
                "pose": {"x": 1.15, "y": 2.34, "theta": 0.08},
                "error": None,
            },
        )
        publish_json(client, topic, payload)

    elif args.mode == "listen":
        print("Listening... Ctrl+C to stop")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

    time.sleep(0.6)
    client.loop_stop()
    client.disconnect()


if __name__ == "__main__":
    main()
