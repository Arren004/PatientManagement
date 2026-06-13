
from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
import threading
import time
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
from action_msgs.msg import GoalStatusArray
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
        self.task_queue = []

        self.current_task = None
        self.is_arrived_at_destination = False
        # --- BẮT ĐẦU SỬA ĐỔI: KHỞI TẠO TIMER TIMEOUT ---
        self.timeout_timer = None
        # --- KẾT THÚC SỬA ĐỔI ---
        # Lưu giá trị pin đã gửi để tránh gửi trùng lặp
        self.last_sent_battery = {}
        # Xử lý (Publish and subscribe) dữ liệu pin của robot
        self.battery_sub = self.create_subscription(
                String,
                "/robot/battery",
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
        # --- BẮT ĐẦU SỬA ĐỔI: KHAI BÁO PUBLISHER TOPIC ĐIỀU KHIỂN ĐÓNG NẮP RIÊNG BIỆT ---
        self.close_pub = self.create_publisher(
            String,
            "/robot/close",
            10
        )
        # --- KẾT THÚC SỬA ĐỔI ---
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
        self.nav_status_sub = self.create_subscription(GoalStatusArray, "/navigate_to_pose/_action/status", self.nav_status_callback, 10)
        self._shutdown_event = threading.Event()
        client_id = f"robot-client-{self.robot_id}"
        self.mqtt_client = mqtt_client.Client(
            client_id=client_id
        )
        self.get_logger().info(
            f"Starting MQTT connection thread to broker.emqx.io:1883 with client_id: {client_id}"
        )
        self._connect_thread = threading.Thread(target=self._connect_loop, daemon=True)
        self._connect_thread.start()
        self.get_logger().info("Processor ready")
    # =========================
    # MQTT → ROS callback
    # =========================
    # def process_next_task(self):

    #     if len(self.task_queue) == 0:

    #         self.current_task = None

    #         self.get_logger().info(
    #             "✅ Queue empty"
    #         )

    #         return

    #     task = self.task_queue.pop(0)

    #     self.current_task = task

    #     self.handle_delivery(task)
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

            self.task_queue.append(data)

            self.get_logger().info(
                f"📦 Queue size: {len(self.task_queue)}"
            )

            if self.current_task is None:
                self.process_next_task()

        elif event_type == "robot.open_lid":
            self.handle_open_lid(data)

    def handle_open_lid(self, data):
        slot = data.get("slot")
        self.get_logger().info(f"🔓 Yêu cầu mở nắp ngăn: {slot}")

        delivery_msg = String()
        delivery_msg.data = json.dumps({
            "name": "OPEN",
            "room": "0",
            "bed": "0",
            "slot": slot,
            "docId": "open_lid"
        })

        self.delivery_info_pub.publish(delivery_msg)
        self.get_logger().info(f"📤 Published to /robot/delivery_info for opening slot {slot}")
    def process_next_task(self):
        """Bốc đơn tiếp theo ra chạy, nếu rỗng thì kích hoạt quay về gốc (0,0,0)"""
        if len(self.task_queue) == 0: 
            self.current_task = None 
            self.get_logger().info(" Đã hoàn thành toàn bộ đơn hàng! Tự động quay về phòng trực (0,0,0)")
            
            # Khởi tạo lệnh đưa xe hồi vị trí xuất phát (0,0,0)
            home_task = {
                "name": "He thong", "room": "Phong truc", "bed": "Goc", "slot": 0, "docId": "HOME_POSE",
                "position": {"x": 0.0, "y": 0.0, "theta": 0.0}
            }
            self.handle_delivery(home_task)
            return

        task = self.task_queue.pop(0) 
        self.current_task = task 
        self.is_arrived_at_destination = False # Giải phóng cờ trạng thái cho hành trình mới
        self.handle_delivery(task) 
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

        # # =========================
        # # 2. DELIVERY INFO
        # # =========================

        # delivery_msg = String()

        # delivery_msg.data = json.dumps({
        #     "name": name,
        #     "room": room,
        #     "bed": bed,
        #     "slot": slot,
        #     "docId": doc_id
        # })

        # self.delivery_info_pub.publish(
        #     delivery_msg
        # )

        # self.get_logger().info(
        #     "📤 Published /robot/delivery_info"
    # )
    def nav_status_callback(self, msg):

        if len(msg.status_list) > 0:
            current_status = msg.status_list[-1].status
            
            # Mã số 4 = STATUS_SUCCEEDED (Nav2 báo đỗ chuẩn dung sai 10cm của bạn)
            if current_status == 4:
                if self.current_task is not None and not self.is_arrived_at_destination:
                    # Nếu là task quay về phòng trực (0,0,0) thì không mở nắp thuốc
                    if self.current_task.get("docId") == "HOME_POSE":
                        self.get_logger().info(" Xe đã lùi về vị trí xuất phát an toàn. Kết thúc chu kỳ giao thuốc!")
                        self.current_task = None
                        return
                        
                    self.get_logger().info(" Đã đến giường bệnh nhân! Phát thông tin hiển thị TFT và bật chốt mở nắp.")
                    
                    # Tiến hành giải nén bộ nhớ đệm bắn xuống cổng /robot/delivery_info cho serial bridge nhận
                    delivery_msg = String() 
                    delivery_msg.data = json.dumps({
                        "name": self.current_task.get("name"), 
                        "room": self.current_task.get("room"), 
                        "bed": self.current_task.get("bed"), 
                        "slot": self.current_task.get("slot"), 
                        "docId": self.current_task.get("docId") 
                    })
                    self.delivery_info_pub.publish(delivery_msg) 
                    self.is_arrived_at_destination = True # Khóa cờ chống trùng lặp

                    # --- BẮT ĐẦU SỬA ĐỔI: THIẾT LẬP BỘ ĐẾM TIMEOUT 120S CHỜ NHẬN THUỐC ---
                    self.get_logger().info("Khởi động bộ đếm ngược 120 giây chờ nhận thuốc...")
                    if self.timeout_timer is not None:
                        try:
                            self.timeout_timer.cancel()
                            self.destroy_timer(self.timeout_timer)
                        except Exception:
                            pass
                        self.timeout_timer = None
                    self.timeout_timer = self.create_timer(120.0, self.on_timeout_callback)
                    # --- KẾT THÚC SỬA ĐỔI ---

            # --- BẮT ĐẦU SỬA ĐỔI: XỬ LÝ LỖI DI CHUYỂN ROBOT (CANCELED, ABORTED, REJECTED) ---
            elif current_status in [5, 6, 7]:
                if self.current_task is not None and not self.is_arrived_at_destination:
                    if self.current_task.get("docId") == "HOME_POSE":
                        self.get_logger().warn(" Gặp lỗi khi di chuyển về phòng trực!")
                        self.current_task = None
                        return
                        
                    self.get_logger().error(f" Lỗi di chuyển robot (Mã trạng thái Nav2: {current_status})!")
                    
                    robot_id = self.robot_id
                    doc_id = self.current_task.get("docId")
                    slot = int(self.current_task.get("slot", 0))
                    
                    # Báo lỗi về MQTT
                    self.send_feedback(robot_id, doc_id, slot, status="failed", reason="navigation_error")
                    
                    self.current_task = None
                    self.process_next_task()
            # --- KẾT THÚC SỬA ĐỔI ---
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

        # --- BẮT ĐẦU SỬA ĐỔI: HỦY TIMER TIMEOUT KHI ĐÃ NHẬN THUỐC THÀNH CÔNG ---
        if self.timeout_timer is not None:
            try:
                self.timeout_timer.cancel()
                self.destroy_timer(self.timeout_timer)
            except Exception:
                pass
            self.timeout_timer = None
            self.get_logger().info("Đã hủy bộ đếm ngược 120 giây do bệnh nhân xác nhận lấy thuốc.")
        # --- KẾT THÚC SỬA ĐỔI ---

        # Gửi thẳng dữ liệu sạch này lên MQTT Broker cho Web cập nhật
        # --- BẮT ĐẦU SỬA ĐỔI: CẬP NHẬT TRẠNG THÁI GIAO HÀNG ---
        self.send_feedback(robot_id, doc_id, slot, status="delivered")
        # --- KẾT THÚC SỬA ĐỔI ---
        self.current_task = None

        self.process_next_task()

    # --- BẮT ĐẦU SỬA ĐỔI: THÊM CALLBACK TIMEOUT 120S CHỜ NHẬN THUỐC ---
    def on_timeout_callback(self):
        self.get_logger().warn("⏰ Quá thời gian 120 giây chờ bệnh nhân nhận thuốc! Bắt đầu đóng nắp tự động và báo lỗi.")
        
        if self.timeout_timer is not None:
            try:
                self.timeout_timer.cancel()
                self.destroy_timer(self.timeout_timer)
            except Exception:
                pass
            self.timeout_timer = None

        if self.current_task is not None:
            robot_id = self.robot_id
            doc_id = self.current_task.get("docId")
            slot = int(self.current_task.get("slot", 0))

            # --- BẮT ĐẦU SỬA ĐỔI: GỬI LỆNH ĐÓNG NẮP QUA TOPIC RIÊNG BIỆT /robot/close ---
            close_msg = String()
            close_msg.data = json.dumps({
                "slot": slot
            })
            self.close_pub.publish(close_msg)
            self.get_logger().info(f"📤 Đã gửi lệnh CLOSE nắp cho ngăn {slot} qua topic /robot/close")
            # --- KẾT THÚC SỬA ĐỔI ---

            # 2. Gửi phản hồi failed lên MQTT
            self.send_feedback(robot_id, doc_id, slot, status="failed", reason="timeout")

            # 3. Giải phóng đơn hiện tại, chạy đơn tiếp theo
            self.current_task = None
            self.process_next_task()
    # --- KẾT THÚC SỬA ĐỔI ---

    # --- BẮT ĐẦU SỬA ĐỔI: BỔ SUNG TRẠNG THÁI VÀ LÝ DO THẤT BẠI TRONG PHẢN HỒI MQTT ---
    def send_feedback(self, robot_id, doc_id, slot, status="delivered", reason=""):
        topic = f"/robots/{robot_id}/delivered"

        feedback = {
            "docId": doc_id,
            "status": status,
            "slot": slot,
            "reason": reason
        }

        # Bắn gói tin lên Broker MQTT
        self.mqtt_client.publish(topic, json.dumps(feedback))
        self.get_logger().info(f"Feedback sent: docId={doc_id}, status={status}, slot={slot}, reason={reason} to topic: {topic}")
    # --- KẾT THÚC SỬA ĐỔI ---
    # =========================
    # BATTERY SUB AND PUBLISH
    # =========================
    # def on_battery(self, msg: BatteryState):

    #     try:

    #         battery = round(
    #             msg.percentage * 100.0,
    #             1
    #         )

    #         robot_id = self.robot_id

    #         self.get_logger().info(
    #             f"🔋 {robot_id}: {battery}%"
    #         )

    #         if not battery.is_integer():
    #             return

    #         battery_int = int(battery)

    #         last_battery = (
    #             self.last_sent_battery.get(robot_id)
    #         )

    #         if last_battery == battery_int:
    #             return

    #         topic = f"/robots/{robot_id}/battery"

    #         payload = {
    #             "schemaVersion": "1.0",
    #             "eventType": "robot.battery.status",
    #             "source": "robot",
    #             "timestamp": datetime.utcnow().isoformat(),

    #             "data": {
    #                 "robotId": robot_id,
    #                 "battery": battery_int,
    #             }
    #         }

    #         self.mqtt_client.publish(
    #             topic,
    #             json.dumps(payload)
    #         )

    #         self.last_sent_battery[
    #             robot_id
    #         ] = battery_int

    #         self.get_logger().info(
    #             f"📤 Publish battery: {battery_int}%"
    #         )

    #     except Exception as e:

    #         self.get_logger().warn(
    #             f"Battery error: {e}"
    #         )
    def on_battery(self, msg: String):

        try:
            percent = int(msg.data)

            robot_id = self.robot_id

            self.get_logger().info(
                f" {robot_id}: {percent}%" 
            )

            last_battery = self.last_sent_battery.get(robot_id)

            if last_battery == percent:
                return

            topic = f"/robots/{robot_id}/battery"

            payload = {
                "schemaVersion": "1.0",
                "eventType": "robot.battery.status",
                "source": "robot",
                "timestamp": datetime.utcnow().isoformat(),

                "robot_id": robot_id,
                "battery_level": percent
            }

            self.mqtt_client.publish(topic, json.dumps(payload))

            self.last_sent_battery[robot_id] = percent

            self.get_logger().info(f" Publish battery: {percent}%") 

        except Exception as e:
            self.get_logger().error(f"Battery error: {e}")

    def _connect_loop(self):
        while not self._shutdown_event.is_set():
            try:
                self.get_logger().info("Attempting to connect to MQTT broker broker.emqx.io:1883...")
                self.mqtt_client.connect("broker.emqx.io", 1883)
                self.mqtt_client.loop_start()
                self.get_logger().info("MQTT connection established and loop started.")
                break
            except Exception as e:
                self.get_logger().warn(f"MQTT connection failed: {e}. Retrying in 5 seconds...")
                for _ in range(50):
                    if self._shutdown_event.is_set():
                        break
                    time.sleep(0.1)

    def destroy_node(self):
        self._shutdown_event.set()
        try:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
        except Exception:
            pass
        super().destroy_node()
            
    
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
