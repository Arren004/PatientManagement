import rclpy
from rclpy.node import Node
from nav_msgs.msg import OccupancyGrid, Odometry
from geometry_msgs.msg import PoseStamped, PoseWithCovarianceStamped
import json
import base64
import io
import time
from PIL import Image
import numpy as np
import paho.mqtt.client as mqtt
from pathlib import Path

def load_robot_id():
    config_path = Path.home() / "robot_config.json"

    try:
        if config_path.exists():
            with open(config_path, "r") as f:
                return json.load(f).get("robot_id")
        return "unknown_robot"
    except:
        return "unknown_robot"

class MapMqttBridge(Node):
    def __init__(self):
        super().__init__('map_mqtt_bridge')
        
        # Cấu hình MQTT
        self.robot_id = load_robot_id()
        self.mqtt_broker = "broker.emqx.io"
        self.mqtt_port = 1883
        self.mqtt_client = mqtt.Client(client_id=f"pi-map-bridge-{self.robot_id}")
        self.mqtt_client.on_connect = self.on_mqtt_connect
        self.mqtt_client.on_message = self.on_mqtt_message
        self.mqtt_client.connect(self.mqtt_broker, self.mqtt_port)
        self.mqtt_client.loop_start()

        # Biến lưu trữ metadata bản đồ để so sánh thay đổi
        self.last_map_hash = None
        self.last_map_msg = None
        self.last_pose_time = 0.0

        # Subscribe các topic ROS 2
        self.map_sub = self.create_subscription(
            OccupancyGrid,
            '/map',
            self.map_callback,
            10
        )
        
        # Đăng ký nhận tọa độ robot từ AMCL (PoseWithCovarianceStamped)
        # Ghi chú: Nếu robot của bạn dùng Odometry trực tiếp từ bánh xe, hãy đổi thành:
        # self.pose_sub = self.create_subscription(Odometry, '/odom', self.pose_callback, 10)
        self.pose_sub = self.create_subscription(
            PoseWithCovarianceStamped,
            '/amcl_pose',
            self.pose_callback,
            10
        )

        self.get_logger().info("Map MQTT Bridge Node đã khởi động thành công!")

    def map_callback(self, msg: OccupancyGrid):
        """Xử lý grid map, nén thành PNG và gửi lên MQTT"""
        self.last_map_msg = msg
        
        # Tạo mã hash đơn giản để kiểm tra xem bản đồ có thay đổi không
        # Tránh gửi bản đồ trùng lặp liên tục qua 4G
        map_hash = hash(bytes(msg.data))
        if map_hash == self.last_map_hash:
            return  # Bản đồ không đổi -> bỏ qua
        
        self.last_map_hash = map_hash
        self.get_logger().info(f"Phát hiện bản đồ mới ({msg.info.width}x{msg.info.height}). Đang nén...")
        self.send_map(msg)

    def send_map(self, msg: OccupancyGrid):
        width = msg.info.width
        height = msg.info.height
        resolution = msg.info.resolution
        origin_x = msg.info.origin.position.x
        origin_y = msg.info.origin.position.y

        # Chuyển grid data [-1, 0, 100] thành ảnh RGB
        data = np.array(msg.data, dtype=np.int8).reshape((height, width))
        img_data = np.zeros((height, width, 3), dtype=np.uint8)

        # Định nghĩa màu sắc (Tông màu hiện đại)
        COLOR_UNKNOWN = [208, 215, 222]   # Màu xám nhạt (Vùng chưa quét)
        COLOR_FREE = [255, 255, 255]      # Màu trắng (Vùng đi được)
        COLOR_OCCUPIED = [30, 41, 59]     # Màu xanh đen/slate (Vật cản)

        img_data[data == -1] = COLOR_UNKNOWN
        img_data[data == 0] = COLOR_FREE
        img_data[data == 100] = COLOR_OCCUPIED

        # Lật ngược ảnh theo chiều dọc vì ROS gốc tọa độ ở Góc dưới-trái, 
        # còn ảnh thì gốc tọa độ ở Góc trên-trái.
        img_data = np.flipud(img_data)

        # Tạo ảnh PNG
        img = Image.fromarray(img_data)
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        
        # Mã hóa Base64
        base64_map = base64.b64encode(buffered.getvalue()).decode('utf-8')

        # Đóng gói payload gửi lên Web
        payload = {
            "robot_id": self.robot_id,
            "resolution": resolution,
            "width": width,
            "height": height,
            "origin_x": origin_x,
            "origin_y": origin_y,
            "image": base64_map  # Chuỗi ảnh PNG nén
        }

        # Gửi qua MQTT (QoS = 1 để đảm bảo Web nhận được)
        self.mqtt_client.publish(
            f"/robots/{self.robot_id}/map",
            json.dumps(payload),
            qos=1,
            retain=True  # Retain giúp Web khi vừa mở lên sẽ nhận được bản đồ ngay lập tức
        )
        self.get_logger().info(f"Đã gửi bản đồ nén PNG lên MQTT. Dung lượng gói: {len(base64_map)//1024} KB")

    def on_mqtt_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.get_logger().info("Connected to MQTT Broker successfully!")
            self.mqtt_client.subscribe(f"/robots/{self.robot_id}/map/request")
        else:
            self.get_logger().error(f"Failed to connect to MQTT Broker, rc={rc}")

    def on_mqtt_message(self, client, userdata, msg):
        if msg.topic == f"/robots/{self.robot_id}/map/request":
            self.get_logger().info("Nhận yêu cầu gửi bản đồ từ Web. Đang gửi lại bản đồ...")
            self.publish_current_map()

    def publish_current_map(self):
        if self.last_map_msg is None:
            self.get_logger().warn("Không có bản đồ trong bộ nhớ đệm để gửi.")
            return
        self.send_map(self.last_map_msg)

    def pose_callback(self, msg):
        """Gửi tọa độ robot lên MQTT với tần suất giới hạn (ví dụ max 5Hz) để tiết kiệm 4G"""
        current_time = time.time()
        if current_time - self.last_pose_time < 0.2:  # 0.2 giây = 5Hz
            return
        
        self.last_pose_time = current_time

        try:
            # Hỗ trợ PoseWithCovarianceStamped và Odometry (dùng msg.pose.pose)
            if hasattr(msg.pose, 'pose'):
                position = msg.pose.pose.position
                orientation = msg.pose.pose.orientation
            # Hỗ trợ PoseStamped (dùng msg.pose)
            else:
                position = msg.pose.position
                orientation = msg.pose.orientation

            x = position.x
            y = position.y
            z = orientation.z
            w = orientation.w
            theta = 2.0 * np.arctan2(z, w)

            pose_data = {
                "robot_id": self.robot_id,
                "x": round(x, 3),
                "y": round(y, 3),
                "theta": round(theta, 3),
                "timestamp": current_time
            }

            self.mqtt_client.publish(
                f"/robots/{self.robot_id}/pose",
                json.dumps(pose_data),
                qos=0
            )
            # Log tọa độ để dễ theo dõi
            self.get_logger().info(f"Đã gửi tọa độ lên Web: x={x:.3f}, y={y:.3f}, theta={theta:.3f}")
        except Exception as e:
            self.get_logger().error(f"Lỗi khi xử lý tọa độ robot: {e}")

def main(args=None):
    rclpy.init(args=args)
    node = MapMqttBridge()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
