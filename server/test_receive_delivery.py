import argparse
import json
import socket
import time

from paho.mqtt import client as mqtt_client


def parse_args():
    parser = argparse.ArgumentParser(
        description="MQTT test client: nhận dữ liệu delivery và feedback delivery"
    )
    parser.add_argument("--broker", default="broker.emqx.io", help="MQTT broker address")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--robot-id", default="1", help="Robot ID để subscribe topic")
    parser.add_argument(
        "--mode",
        choices=["delivery", "delivered", "both"],
        default="both",
        help="Chọn topic để lắng nghe",
    )
    return parser.parse_args()


def format_payload(payload: bytes) -> str:
    try:
        raw = payload.decode(errors="ignore")
        data = json.loads(raw)
        pretty = json.dumps(data, ensure_ascii=False, indent=2)
        return f"{pretty}"
    except Exception:
        return payload.decode(errors="ignore")


def main():
    args = parse_args()
    robot_id = args.robot_id
    broker = args.broker
    port = args.port

    topics = []
    if args.mode in ("delivery", "both"):
        topics.append(f"/robots/{robot_id}/delivery")
    if args.mode in ("delivered", "both"):
        topics.append(f"/robots/{robot_id}/delivered")

    if not topics:
        raise SystemExit("Không có topic nào để đăng ký. Sử dụng --mode delivery|delivered|both")

    client_id = f"test-recv-delivery-{int(time.time())}"
    client = mqtt_client.Client(client_id=client_id)

    def on_connect(c, userdata, flags, rc):
        print(f"Connected to MQTT broker {broker}:{port} rc={rc}")
        for topic in topics:
            c.subscribe(topic, qos=1)
            print(f"Subscribed to {topic}")

    def on_message(c, userdata, msg):
        print("\n=== MESSAGE RECEIVED ===")
        print(f"Topic: {msg.topic}")
        print("Payload:")
        print(format_payload(msg.payload))

    client.on_connect = on_connect
    client.on_message = on_message

    timeout_seconds = 10
    previous_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(timeout_seconds)
    try:
        client.connect(broker, port)
    except Exception as exc:
        print(f"ERROR: Không thể kết nối tới MQTT broker {broker}:{port}.\n{exc}")
        print("Kiểm tra địa chỉ broker hoặc kết nối mạng, sau đó chạy lại với --broker và --port tương ứng.")
        return
    finally:
        socket.setdefaulttimeout(previous_timeout)

    client.loop_start()

    print("Listening for delivery messages. Nhấn Ctrl+C để dừng.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
