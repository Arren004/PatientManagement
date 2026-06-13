from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from unicodedata import name
from paho.mqtt import client as mqtt_client

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
# Xác định tọa độ các phòng và giường 
from geometry_msgs.msg import PoseStamped
#Tốc độ
from geometry_msgs.msg import Twist
from sensor_msgs.msg import BatteryState
import math

def load_robot_id():
    config_path = Path.home() / "robot_config.json"

    try:
        if config_path.exists():
            with open(config_path, "r") as f:
                return json.load(f).get("robot_id")
        return "unknown_robot"
    except:
        return "unknown_robot"



class ProcessorNode(Node):
    def __init__(self):
        super().__init__("mqtt_processor")
        self.robot_id = load_robot_id()
        # Lưu giá trị pin đã gửi để tránh gửi trùng lặp
        self.last_sent_battery = {}
        # Xử lý (Publish and subscribe) dữ liệu pin của robot
        self.battery_sub = self.create_subscription(
                BatteryState,
                "/battery_state",
                self.on_battery,
                10
        )     
        #Xử lý delivery
        self.done_sub = self.create_subscription(
            String,
            "/robot/done",
            self.on_done,
            10
        )
        # Tốc độ
        self.cmd_vel_pub = self.create_publisher(
            Twist,
            "/cmd_vel",
            10
        )
        # Delivery
        self.delivery_info_pub = self.create_publisher(
            String,
            "/robot/delivery_info",
            10
        )
        #Navigation
        self.goal_pub = self.create_publisher(
            PoseStamped,
            "/goal_pose",
            10
        )
        # Subscribe lệnh từ backend
        self.subscription = self.create_subscription(
            String,
            "/mqtt/incoming",
            self.on_message,
            10
        )
       
        self.mqtt_client = mqtt_client.Client(
            client_id="robot-client"
        )
        self.mqtt_client.connect("broker.hivemq.com", 1883)
        self.mqtt_client.loop_start()
        self.get_logger().info("Processor ready")
    # =========================
    # MQTT → ROS callback
    # =========================
    def on_message(self, msg: String):
        try:
            envelope = json.loads(msg.data)
        except Exception:
            return

        payload = envelope.get("payload", {})
        event_type = payload.get("eventType", "")
        data = payload.get("data", {})

        if event_type == "robot.speed.command":
            self.handle_speed(data)

        elif event_type == "delivery.command":
            self.handle_delivery(data)

    # =========================
    # SPEED
    # =========================
    def handle_speed(self, data):

        v = data.get("v")
        w = data.get("w")

        # kiểm tra dữ liệu
        if v is None or w is None:

            self.get_logger().warn(
                "Missing v/w"
            )

            return

        try:

            linear_v = float(v)
            angular_w = float(w)

        except (TypeError, ValueError):

            self.get_logger().warn(
                "Invalid v/w"
            )

            return

        self.get_logger().info(
            f"🚗 cmd_vel → v={linear_v}, w={angular_w}"
        )

        # Twist message
        msg = Twist()

        # linear velocity
        msg.linear.x = linear_v

        # angular velocity
        msg.angular.z = angular_w

        # publish
        self.cmd_vel_pub.publish(msg)

        self.get_logger().info(
            "📤 Published /cmd_vel"
        )
    # DELIVERY
    # =========================
    def handle_delivery(self, data):

        name = data.get("name")
        room = data.get("room")
        bed = data.get("bed")
        slot = data.get("slot")
        doc_id = data.get("docId")

        position = data.get("position", {})

        x = position.get("x", 0.0)
        y = position.get("y", 0.0)
        theta = position.get("theta", 0.0)

        self.get_logger().info(
            f"📍 Move to ({x}, {y}, {theta})"
        )

        # =========================
        # 1. NAVIGATION
        # =========================

        nav_msg = PoseStamped()

        nav_msg.header.frame_id = "map"

        nav_msg.header.stamp = (
            self.get_clock().now().to_msg()
        )
        #Position
        nav_msg.pose.position.x = float(x)
        nav_msg.pose.position.y = float(y)
        nav_msg.pose.position.z = 0.0
        #Orientation 
        nav_msg.pose.orientation.x = 0.0
        nav_msg.pose.orientation.y = 0.0
        nav_msg.pose.orientation.z = math.sin(theta / 2.0)
        nav_msg.pose.orientation.w = math.cos(theta / 2.0)

        self.goal_pub.publish(nav_msg)

        self.get_logger().info(
            "📤 Published /goal_pose"
        )

        # =========================
        # 2. DELIVERY INFO
        # =========================

        delivery_msg = String()

        delivery_msg.data = json.dumps({
            "name": name,
            "room": room,
            "bed": bed,
            "slot": slot,
            "docId": doc_id
        })

        self.delivery_info_pub.publish(
            delivery_msg
        )

        self.get_logger().info(
            "📤 Published /robot/delivery_info"
    )
    # =========================
    # SEND DELIVERY DONE
    # =========================
    # def on_done(self, msg: String):
    #     try:
    #         data = json.loads(msg.data)
    #     except:
    #         return

    #     robot_id = data.get("robotId")
    #     doc_id = data.get("docId")

    #     if not hasattr(self, "current_task"):
    #         return

    #     task = self.current_task

    #     # check đúng task
    #     if task["doc_id"] != doc_id:
    #         return

    #     self.get_logger().info(f"✅ DONE received from robot: {doc_id}")

    #     self.send_feedback(
    #         task["robot_id"],
    #         task["doc_id"],
    #         task["slot"]
    #     )

    #     self.current_task = None
    # def send_feedback(self, robot_id, doc_id, slot):
    #     topic = f"/robots/{robot_id}/delivered"

    #     feedback = {
    #         "docId": doc_id,
    #         "status": "delivered",
    #         "slot": slot,
    #     }

    #     self.mqtt_client.publish(topic, json.dumps(feedback))

    #     self.get_logger().info(f"✅ Delivered: {doc_id}")
    def on_done(self, msg: String):
        try:
            # Giải mã dữ liệu JSON được truyền từ topic /robot/done sang
            data = json.loads(msg.data)
        except Exception as e:
            self.get_logger().error(f"Loi giai ma JSON trong on_done: {e}")
            return

        # Lấy đầy đủ 3 thông tin quan trọng ra, ép về kiểu dữ liệu chuẩn
        robot_id = str(data.get("robotId", ""))
        doc_id = str(data.get("docId", ""))
        slot = int(data.get("slot", 0))

        # Kiểm tra điều kiện an toàn bảo vệ hệ thống nếu dữ liệu rỗng
        if not robot_id or not doc_id:
            self.get_logger().warn("Tin nhan /robot/done thieu thong tin robotId hoac docId")
            return

        self.get_logger().info(f"DONE received from robot for docId: {doc_id}")

        # Gửi thẳng dữ liệu sạch này lên MQTT Broker cho Web cập nhật
        self.send_feedback(robot_id, doc_id, slot)

    def send_feedback(self, robot_id, doc_id, slot):
        topic = f"/robots/{robot_id}/delivered"

        feedback = {
            "docId": doc_id,
            "status": "delivered",
            "slot": slot,
        }

        # Bắn gói tin lên Broker MQTT
        self.mqtt_client.publish(topic, json.dumps(feedback))
        self.get_logger().info(f"Delivered: {doc_id} to topic: {topic}")
    # =========================
    # BATTERY SUB AND PUBLISH
    # =========================
    def on_battery(self, msg: BatteryState):

        try:

            battery = round(
                msg.percentage * 100.0,
                1
            )

            robot_id = self.robot_id

            self.get_logger().info(
                f"🔋 {robot_id}: {battery}%"
            )

            if not battery.is_integer():
                return

            battery_int = int(battery)

            last_battery = (
                self.last_sent_battery.get(robot_id)
            )

            if last_battery == battery_int:
                return

            topic = f"/robots/{robot_id}/battery"

            payload = {
                "schemaVersion": "1.0",
                "eventType": "robot.battery.status",
                "source": "robot",
                "timestamp": datetime.utcnow().isoformat(),

                "data": {
                    "robotId": robot_id,
                    "battery": battery_int,
                }
            }

            self.mqtt_client.publish(
                topic,
                json.dumps(payload)
            )

            self.last_sent_battery[
                robot_id
            ] = battery_int

            self.get_logger().info(
                f"📤 Publish battery: {battery_int}%"
            )

        except Exception as e:

            self.get_logger().warn(
                f"Battery error: {e}"
            )
            
    
def main():
    rclpy.init()

    node = ProcessorNode()
  
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
