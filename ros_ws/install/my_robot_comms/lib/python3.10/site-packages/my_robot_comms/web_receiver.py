from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from pathlib import Path

from paho.mqtt import client as mqtt_client

import rclpy
from rclpy.node import Node
from std_msgs.msg import String as RosString
import random
import time



# =========================
# LOAD ROBOT ID (1 lần)
# =========================
def load_robot_id():
    config_path = Path.home() / "robot_config.json"

    try:
        if config_path.exists():
            with open(config_path, "r") as f:
                data = json.load(f)
                robot_id = data.get("robot_id")
                if robot_id:
                    return robot_id
        return "unknown_robot"

    except Exception as e:
        print(f"[ERROR] load_robot_id failed: {e}")
        return "unknown_robot"


# =========================
# CONFIG
# =========================
@dataclass
class BridgeConfig:
    broker: str
    port: int
    mqtt_topic: str
    ros_topic: str
    client_id: str


# =========================
# MQTT → ROS2 NODE
# =========================
class MqttReceiverNode(Node):
    def __init__(self, config: BridgeConfig):
        super().__init__("mqtt_receiver")

        random_num = random.randint(1000, 9999)
        client_id = f"robot_huy_{random_num}"

        # Khởi tạo client với ID ngẫu nhiên này
        self.mqtt_client = mqtt_client.Client(client_id=client_id)

        self._config = config
        self._shutdown_event = threading.Event()

        self._publisher = self.create_publisher(
            RosString,
            config.ros_topic,
            10
        )

        self._mqtt_client = mqtt_client.Client(
            client_id=config.client_id
        )

        self._mqtt_client.on_connect = self._on_connect
        self._mqtt_client.on_message = self._on_message

        self.get_logger().info(
            f"MQTT connect {config.broker}:{config.port}"
        )

        self._mqtt_client.connect(config.broker, config.port)
        self._mqtt_client.loop_start()

    # =========================
    # CONNECT
    # =========================
    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            client.subscribe(self._config.mqtt_topic, qos=1)
            self.get_logger().info(
                f"Subscribed: {self._config.mqtt_topic}"
            )
        else:
            self.get_logger().error(
                f"MQTT connect failed: {rc}"
            )

    # =========================
    # MESSAGE HANDLER
    # =========================
    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
        except Exception:
            return

        # bỏ heartbeat
        if payload.get("eventType") == "backend.heartbeat":
            return

        envelope = {
            "topic": msg.topic,
            "payload": payload,
        }

        # publish ROS
        ros_msg = RosString()
        ros_msg.data = json.dumps(envelope, ensure_ascii=False)
        self._publisher.publish(ros_msg)

        # log events
        event_type = payload.get("eventType", "")
        data = payload.get("data", {})

        if event_type == "robot.speed.command":
            self.get_logger().info(
                f"🚗 Speed: v={data.get('v')} w={data.get('w')} (legacy speed={data.get('speed')})"
            )

        elif event_type == "delivery.command":
            self.get_logger().info(
                f"Delivery Data → {data}"
            )

        elif event_type == "robot.battery.status":
            self.get_logger().info(
                f"🔋 Battery: {data.get('battery')}%"
            )

    # =========================
    # STOP CLEANLY
    # =========================
    def stop(self):
        if self._shutdown_event.is_set():
            return

        self._shutdown_event.set()
        self._mqtt_client.loop_stop()
        self._mqtt_client.disconnect()


# =========================
# MAIN
# =========================
def main():
    rclpy.init()

    robot_id = load_robot_id()

    node = MqttReceiverNode(
        BridgeConfig(
            broker="broker.hivemq.com",
            port=1883,
            mqtt_topic=f"/robots/{robot_id}/#",
            ros_topic="/mqtt/incoming",
            client_id=f"ros2-mqtt-{robot_id}",
        )
    )

    node.get_logger().info(
        f"🤖 Robot ID: {robot_id}"
    )

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.stop()
        node.destroy_node()
        rclpy.shutdown()


# =========================
# ENTRY POINT
# =========================
if __name__ == "__main__":
    main()