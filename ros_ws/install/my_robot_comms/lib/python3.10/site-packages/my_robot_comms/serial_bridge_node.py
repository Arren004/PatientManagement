import rclpy
from std_msgs.msg import String
from rclpy.node import Node
import struct
import math
from pathlib import Path
import serial
from geometry_msgs.msg import Twist, Quaternion, TransformStamped
from nav_msgs.msg import Odometry
from std_msgs.msg import Float32, Bool
from tf2_ros import TransformBroadcaster
import json
import unicodedata
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
class SerialBridgeNode(Node):
    def __init__(self):
        super().__init__('serial_bridge_node')
        self.robot_id = load_robot_id()
        # Cấu hình Serial (Kiểm tra đúng cổng /dev/ttyACM0)
        self.declare_parameter('port', '/dev/ttyACM0')
        port = self.get_parameter('port').value
        self.ser = serial.Serial(port, 115200, timeout=0.1)

        # --- Biến định vị (Odometry) ---
        self.x = 0.0
        self.y = 0.0
        self.th = 0.0
        self.last_time = self.get_clock().now()

        # Publisher gửi trang thai nut nhan lên topic /robot/done
        self.done_pub = self.create_publisher(String, '/robot/done', 10)
        
        # Subscriber nhận lệnh vận tốc từ Nav2/Teleop
        self.subscription = self.create_subscription(Twist, 'cmd_vel', self.cmd_vel_callback, 10)
        
        # Subscriber nhận lệnh mở ngăn thuốc từ Mission Node
        self.drug_sub = self.create_subscription(String, '/robot/delivery_info', self.drug_callback, 10)
        
        # Publisher gửi Odometry và Pin lên ROS 2
        self.odom_pub = self.create_publisher(Odometry, 'odom', 10)
        self.battery_pub = self.create_publisher(Float32, 'battery_status', 10)
        self.confirm_pub = self.create_publisher(Bool(data=True), 'patient_confirm', 10)

        # Để robot hiện trên Rviz, cần một Broadcaster để gửi tọa độ TF
        self.tf_broadcaster = TransformBroadcaster(self)
        
        # Timer đọc dữ liệu từ STM32 (Uplink) - 20Hz
        self.timer = self.create_timer(0.05, self.receive_from_stm32)
        
        self.get_logger().info(f'Serial Bridge Node started on {port}')

    def calculate_checksum(self, payload):
        # Tổng các byte trong payload (Type + Len + Data)
        return sum(payload) & 0xFF

    def cmd_vel_callback(self, msg):
        # 1. Lấy v và w
        v = msg.linear.x
        w = msg.angular.z
        
        # 2. Đóng gói HEX (Type 0x03, Len 8 byte cho 2 số float)
        # Định dạng '<ff': Little Endian, 2 số float 4-byte
        data = struct.pack('<ff', v, w)
        header = [0xAA, 0x03, 0x08]
        checksum = self.calculate_checksum(header[1:] + list(data))
        
        packet = bytearray(header) + data + bytearray([checksum, 0x55])
        
        # 3. Gửi xuống STM32
        self.ser.write(packet)
    # Sửa lại dòng này trong Class của Huy
    def remove_accents(self, input_str): # Thêm self vào đây
        nf_form = unicodedata.normalize('NFKD', input_str)
        return "".join([c for c in nf_form if not unicodedata.combining(c)])

    # def drug_callback(self, msg):
    #     # Xử lý chuỗi "ID,Bed,Name" như cấu trúc PayloadOpen của Huy
    #     try:
    #         parts = msg.data.split(',')
    #         comp_id = int(parts[0])
    #         bed = parts[1].ljust(5, '\0')[:5].encode('ascii')
    #         name = parts[2].ljust(5, '\0')[:5].encode('ascii')
            
    #         data = bytearray([comp_id]) + bed + name
    #         header = [0xAA, 0x02, 0x0B] # Type 0x02, Len 11
    #         checksum = self.calculate_checksum(header[1:] + list(data))
            
    #         packet = bytearray(header) + data + bytearray([checksum, 0x55])
    #         self.ser.write(packet)
    #     except Exception as e:
    #         self.get_logger().error(f'Drug command error: {e}')
    def drug_callback(self, msg):
        try:
            # 1. Giải mã dữ liệu JSON từ Web gửi xuống thông qua topic
            data_json = json.loads(msg.data)
            
            # Ghi nhận nhiệm vụ hiện tại ngay tại đây để phục vụ cho nút nhấn STM32
            self.current_task = {
                "robot_id": self.robot_id,
                "doc_id": data_json.get("docId"),
                "slot": data_json.get("slot")
            }
            self.get_logger().info(f"Da ghi nhan current_task: {self.current_task}")
            
            # 2. Lấy và ép kiểu ID ngăn thuốc (slot) sang số nguyên
            comp_id = int(data_json['slot']) 
            
            # 3. Xử lý số giường (bed) - Lọc bỏ chữ "Giường/Giuong"
            bed_raw = str(data_json['bed'])
            bed_cleaned = bed_raw.replace("Giường", "").replace("giường", "")
            bed_cleaned = bed_cleaned.replace("Giuong", "").replace("giuong", "").strip()
            bed_no_accent = self.remove_accents(bed_cleaned)
            bed = bed_no_accent.ljust(5, '\0')[:5].encode('ascii')
            
            # 4. Lấy tên bệnh nhân, xóa dấu tiếng Việt và ép về cố định 5 ký tự
            name_raw = str(data_json['name'])
            name_no_accent = self.remove_accents(name_raw)
            name = name_no_accent.ljust(5, '\0')[:5].encode('ascii')
            
            # 5. Đóng gói dữ liệu Payload (Độ dài chuẩn: 1 + 5 + 5 = 11 byte)
            data = bytearray([comp_id]) + bed + name
            header = [0xAA, 0x02, 0x0B] 
            checksum = self.calculate_checksum(header[1:] + list(data))
            packet = bytearray(header) + data + bytearray([checksum, 0x55])
            
            # 6. Gửi gói tin xuống STM32
            self.ser.write(packet)
            self.get_logger().info(
                f"Da gui lenh mo ngan {comp_id} - Giuong TFT: {bed_no_accent[:5]} - Ten TFT: {name_no_accent[:5]}"
            )

        except Exception as e:
            self.get_logger().error(f"Drug command error: {e}")


    def receive_from_stm32(self):
        # Logic nhận Uplink từ STM32 (Odom, Pin, Button)
        while self.ser.in_waiting > 0:
            header = self.ser.read(1)
            if header == b'\xaa':
                type_info = self.ser.read(1)
                if len(type_info) < 1: return
                p_type = type_info[0]
            
            # Huy tự định nghĩa độ dài Payload ở đây thay vì đọc từ STM32
            if p_type == 0x05:   # ODOM: Yaw(2) + vL(4) + vR(4)
                p_len = 10
            elif p_type == 0x04: # BATTERY: Pin(2) + Button(1)
                p_len = 3
            else:
                # Nếu gặp Type lạ, quay lại tìm Header tiếp theo
                continue
            # Đọc Payload + Checksum + Footer
            remaining = self.ser.read(p_len + 2)
            if len(remaining) < (p_len + 2): return
            
            payload = remaining[:p_len]
            footer = remaining[p_len + 1]

            if footer == 0x55:
                if p_type == 0x05:
                    # Yaw(h) + vL(f) + vR(f)
                    yaw, vL, vR = struct.unpack('<hff', payload)
                    self.update_odometry(vL, vR) # Tạm thời dùng vL làm v
                elif p_type == 0x04:
                    raw_bat, btn_val = struct.unpack('<hB', payload)
                    self.get_logger().info(f"Pin: {raw_bat}, Nut nhan: {btn_val}")
                    
                    if btn_val == 1:
                        self.get_logger().info("Da bat duoc tin hieu nut nhan!")
                        
                        # Check xem co task khong, moi thu phai nam TRONG khoi if nay
                        if hasattr(self, "current_task") and self.current_task is not None:
                            task = self.current_task
                            
                            # Thut le dong bo cho toan bo block done_data
                            done_data = {
                                "robotId": str(task.get("robot_id", "")),
                                "docId": str(task.get("doc_id", "")),
                                "slot": int(task.get("slot", 0))
                            }
                            
                            done_msg = String()
                            done_msg.data = json.dumps(done_data)
                            
                            # Thuc hien publish len topic /robot/done
                            self.done_pub.publish(done_msg)
                            self.get_logger().info(f"Da tu dong publish /robot/done: Ngan {done_data['slot']} cho docId: {done_data['docId']}")
                        
                        else:
                            # Neu an nut ma khong co task thi canh bao
                            self.get_logger().warn("Nhan duoc nut nhan nhung hien tai khong co task nao dang chay!")
    # def receive_from_stm32(self):
    #     try:
    #         # Vòng lặp đọc cho đến khi cạn bộ đệm Serial
    #         while self.ser.in_waiting > 0:
    #             # Tìm byte Header 0xAA
    #             header = self.ser.read(1)
    #             if not header or header != b'\xaa':
    #                 continue  # Bỏ qua byte rác, tiếp tục quét tìm 0xAA
                
    #             # Đọc byte Type tiếp theo
    #             type_info = self.ser.read(1)
    #             if len(type_info) < 1: 
    #                 return
    #             p_type = type_info[0]
                
    #             # Định nghĩa độ dài Payload dựa theo Loại gói tin
    #             if p_type == 0x05:    # ODOM: Yaw(2) + vL(4) + vR(4)
    #                 p_len = 10
    #             elif p_type == 0x04:  # BATTERY/BUTTON: Pin(2) + Button(1)
    #                 p_len = 3
    #             else:
    #                 # Nếu gặp Loại gói lạ (Rác), bỏ qua để quét lại Header tiếp theo
    #                 continue
                
    #             # Đọc toàn bộ phần còn lại: Payload (p_len bytes) + Checksum (1 byte) + Footer (1 byte)
    #             remaining = self.ser.read(p_len + 2)
    #             if len(remaining) < (p_len + 2):
    #                 return  # Gói tin bị thiếu byte, đợi chu kỳ sau đọc tiếp
                
    #             payload = remaining[:p_len]
    #             checksum_received = remaining[p_len]
    #             footer = remaining[p_len + 1]
                
    #             # # Kiểm tra byte kết thúc Footer chuẩn khung truyền
    #             # if footer != 0x55:
    #             #     self.get_logger().warn("Gói tin sai Footer (Lech khung truyen UART), dang dong bo lai...")
    #             #     continue  # Sai khung truyền, bỏ gói này để quét tìm Header mới
                
    #             # --- KHU VỰC XỬ LÝ DỮ LIỆU CHUẨN ---
    #             if p_type == 0x05:
    #                 # Giải mã gói tin Odom
    #                 yaw, vL, vR = struct.unpack('<hff', payload)
    #                 self.update_odometry(vL, vR)
                    
    #             elif p_type == 0x04:
    #                 # Giải mã gói tin Pin và Nút nhấn
    #                 raw_bat, btn_val = struct.unpack('<hB', payload)
                    
    #                 # Log định kỳ để Huy giám sát trực tiếp trên màn hình công cụ
    #                 self.get_logger().info(f"Pin: {raw_bat} | Nut nhan: {btn_val}")
                    
    #                 # Xử lý khi có xung nút nhấn (Mức 1)
    #                 if btn_val == 1:
    #                     self.get_logger().info("Da bat duoc tin hieu nut nhan tu STM32!")
                        
    #                     # Kiểm tra nhiệm vụ hiện tại có tồn tại không
    #                     if hasattr(self, "current_task") and self.current_task is not None:
    #                         task = self.current_task
                            
    #                         done_data = {
    #                             "robotId": str(task.get("robot_id", "")),
    #                             "docId": str(task.get("doc_id", "")),
    #                             "slot": int(task.get("slot", 0))
    #                         }
                            
    #                         done_msg = String()
    #                         done_msg.data = json.dumps(done_data)
                            
    #                         # Tiến hành phát tín hiệu kết thúc lên hệ thống ROS 2
    #                         self.done_pub.publish(done_msg)
    #                         self.get_logger().info(f"Da tu dong phat /robot/done phuc vu ngan thuoc so {done_data['slot']}")
    #                     else:
    #                         self.get_logger().warn("Nhan duoc nut nhan hung Robot chua duoc giao Task nao tu Web!")
                            
    #     except Exception as e:
    #         self.get_logger().error(f"Loi he thong trong vong lap nhan UART: {e}")
    def update_odometry(self, v, w):
        current_time = self.get_clock().now()
        dt = (current_time - self.last_time).nanoseconds / 1e9
        self.last_time = current_time
    
    # Tích phân vận tốc để tính toán vị trí (Odometry Kinematics)
        # Giả sử robot di chuyển theo mô hình vi sai (Differential Drive)
        delta_x = (v * math.cos(self.th)) * dt
        delta_y = (v * math.sin(self.th)) * dt
        delta_th = w * dt

        self.x += delta_x
        self.y += delta_y
        self.th += delta_th

        # 1. Tạo tin nhắn Quaternion từ góc Yaw (theta)
        q = self.euler_to_quaternion(0, 0, self.th)

        # 2. Publish TF (Để LiDAR khớp với vị trí robot trong không gian)
        t = TransformStamped()
        t.header.stamp = current_time.to_msg()
        t.header.frame_id = 'odom'
        t.child_frame_id = 'base_link'
        t.transform.translation.x = self.x
        t.transform.translation.y = self.y
        t.transform.rotation = q
        self.tf_broadcaster.sendTransform(t)

        # 3. Publish Odom Topic
        odom = Odometry()
        odom.header.stamp = current_time.to_msg()
        odom.header.frame_id = 'odom'
        odom.child_frame_id = 'base_link'
        odom.pose.pose.position.x = self.x
        odom.pose.pose.position.y = self.y
        odom.pose.pose.orientation = q
        odom.twist.twist.linear.x = v
        odom.twist.twist.angular.z = w
        self.odom_pub.publish(odom)

    def euler_to_quaternion(self, roll, pitch, yaw):
        """Chuyển đổi góc Euler sang Quaternion chuẩn ROS 2"""
        qx = math.sin(roll/2) * math.cos(pitch/2) * math.cos(yaw/2) - math.cos(roll/2) * math.sin(pitch/2) * math.sin(yaw/2)
        qy = math.cos(roll/2) * math.sin(pitch/2) * math.cos(yaw/2) + math.sin(roll/2) * math.cos(pitch/2) * math.sin(yaw/2)
        qz = math.cos(roll/2) * math.cos(pitch/2) * math.sin(yaw/2) - math.sin(roll/2) * math.sin(pitch/2) * math.cos(yaw/2)
        qw = math.cos(roll/2) * math.cos(pitch/2) * math.cos(yaw/2) + math.sin(roll/2) * math.sin(pitch/2) * math.sin(yaw/2)
        return Quaternion(x=qx, y=qy, z=qz, w=qw)
def main(args=None):
    rclpy.init(args=args)
    node = SerialBridgeNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

# import rclpy
# from std_msgs.msg import String
# from rclpy.node import Node
# from pathlib import Path
# from unicodedata import name
# import struct
# import math
# import serial
# from geometry_msgs.msg import Twist, Quaternion, TransformStamped
# from nav_msgs.msg import Odometry
# from std_msgs.msg import Float32, Bool
# from tf2_ros import TransformBroadcaster
# import json
# import unicodedata

# def load_robot_id():
#     config_path = Path.home() / "robot_config.json"

#     try:
#         if config_path.exists():
#             with open(config_path, "r") as f:
#                 data = json.load(f)
#                 robot_id = data.get("robot_id")
#                 if robot_id:
#                     return robot_id
#         return "unknown_robot"

#     except Exception as e:
#         print(f"[ERROR] load_robot_id failed: {e}")
#         return "unknown_robot"
# class SerialBridgeNode(Node):
#     def __init__(self):
#         super().__init__('serial_bridge_node')
#         self.robot_id = load_robot_id()
#         # Cấu hình Serial (Kiểm tra đúng cổng /dev/ttyACM0)
#         self.declare_parameter('port', '/dev/ttyACM0')
#         port = self.get_parameter('port').value
#         self.ser = serial.Serial(port, 115200, timeout=0.1)

#         # --- Biến định vị (Odometry) ---
#         self.x = 0.0
#         self.y = 0.0
#         self.th = 0.0
#         self.last_time = self.get_clock().now()

#         # Publisher gửi trang thai nut nhan lên topic /robot/done
#         self.done_pub = self.create_publisher(String, '/robot/done', 10)
        
#         # Subscriber nhận lệnh vận tốc từ Nav2/Teleop
#         self.subscription = self.create_subscription(Twist, 'cmd_vel', self.cmd_vel_callback, 10)
        
#         # Subscriber nhận lệnh mở ngăn thuốc từ Mission Node
#         self.delivery_sub = self.create_subscription(
#             String,
#             '/robot/delivery_info',
#             self.drug_callback,
#             10
#         )
        
#         # Publisher gửi Odometry và Pin lên ROS 2
#         self.odom_pub = self.create_publisher(Odometry, 'odom', 10)
#         self.battery_pub = self.create_publisher(Float32, 'battery_status', 10)
#         self.confirm_pub = self.create_publisher(Bool(data=True), 'patient_confirm', 10)

#         # Để robot hiện trên Rviz, cần một Broadcaster để gửi tọa độ TF
#         self.tf_broadcaster = TransformBroadcaster(self)
        
#         # Timer đọc dữ liệu từ STM32 (Uplink) - 20Hz
#         self.timer = self.create_timer(0.05, self.receive_from_stm32)
        
#         self.get_logger().info(f'Serial Bridge Node started on {port}')

#     def calculate_checksum(self, payload):
#         # Tổng các byte trong payload (Type + Len + Data)
#         return sum(payload) & 0xFF

#     def cmd_vel_callback(self, msg):
#         # 1. Lấy v và w
#         v = msg.linear.x
#         w = msg.angular.z
        
#         # 2. Đóng gói HEX (Type 0x03, Len 8 byte cho 2 số float)
#         # Định dạng '<ff': Little Endian, 2 số float 4-byte
#         data = struct.pack('<ff', v, w)
#         header = [0xAA, 0x03, 0x08]
#         checksum = self.calculate_checksum(header[1:] + list(data))
        
#         packet = bytearray(header) + data + bytearray([checksum, 0x55])
        
#         # 3. Gửi xuống STM32
#         self.ser.write(packet)
#     # Sửa lại dòng này trong Class của Huy
#     def remove_accents(self, input_str): # Thêm self vào đây
#         nf_form = unicodedata.normalize('NFKD', input_str)
#         return "".join([c for c in nf_form if not unicodedata.combining(c)])

#     # def drug_callback(self, msg):
#     #     # Xử lý chuỗi "ID,Bed,Name" như cấu trúc PayloadOpen của Huy
#     #     try:
#     #         parts = msg.data.split(',')
#     #         comp_id = int(parts[0])
#     #         bed = parts[1].ljust(5, '\0')[:5].encode('ascii')
#     #         name = parts[2].ljust(5, '\0')[:5].encode('ascii')
            
#     #         data = bytearray([comp_id]) + bed + name
#     #         header = [0xAA, 0x02, 0x0B] # Type 0x02, Len 11
#     #         checksum = self.calculate_checksum(header[1:] + list(data))
            
#     #         packet = bytearray(header) + data + bytearray([checksum, 0x55])
#     #         self.ser.write(packet)
#     #     except Exception as e:
#     #         self.get_logger().error(f'Drug command error: {e}')
    # def drug_callback(self, msg):
    #     try:
    #         # 1. Giải mã dữ liệu JSON từ Web gửi xuống thông qua topic
    #         data_json = json.loads(msg.data)
            
    #         # Ghi nhận nhiệm vụ hiện tại ngay tại đây để phục vụ cho nút nhấn STM32
    #         self.current_task = {
    #             "robot_id": data_json.get("robotId"),
    #             "doc_id": data_json.get("docId"),
    #             "slot": data_json.get("slot")
    #         }
    #         self.get_logger().info(f"Da ghi nhan current_task: {self.current_task}")
            
    #         # 2. Lấy và ép kiểu ID ngăn thuốc (slot) sang số nguyên
    #         comp_id = int(data_json['slot']) 
            
    #         # 3. Xử lý số giường (bed) - Lọc bỏ chữ "Giường/Giuong"
    #         bed_raw = str(data_json['bed'])
    #         bed_cleaned = bed_raw.replace("Giường", "").replace("giường", "")
    #         bed_cleaned = bed_cleaned.replace("Giuong", "").replace("giuong", "").strip()
    #         bed_no_accent = self.remove_accents(bed_cleaned)
    #         bed = bed_no_accent.ljust(5, '\0')[:5].encode('ascii')
            
    #         # 4. Lấy tên bệnh nhân, xóa dấu tiếng Việt và ép về cố định 5 ký tự
    #         name_raw = str(data_json['name'])
    #         name_no_accent = self.remove_accents(name_raw)
    #         name = name_no_accent.ljust(5, '\0')[:5].encode('ascii')
            
    #         # 5. Đóng gói dữ liệu Payload (Độ dài chuẩn: 1 + 5 + 5 = 11 byte)
    #         data = bytearray([comp_id]) + bed + name
    #         header = [0xAA, 0x02, 0x0B] 
    #         checksum = self.calculate_checksum(header[1:] + list(data))
    #         packet = bytearray(header) + data + bytearray([checksum, 0x55])
            
    #         # 6. Gửi gói tin xuống STM32
    #         self.ser.write(packet)
    #         self.get_logger().info(
    #             f"Da gui lenh mo ngan {comp_id} - Giuong TFT: {bed_no_accent[:5]} - Ten TFT: {name_no_accent[:5]}"
    #         )

    #     except Exception as e:
    #         self.get_logger().error(f"Drug command error: {e}")

#     def receive_from_stm32(self):
#         # Logic nhận Uplink từ STM32 (Odom, Pin, Button)
#         while self.ser.in_waiting > 0:
#             header = self.ser.read(1)
#             if header == b'\xaa':
#                 type_info = self.ser.read(1)
#                 if len(type_info) < 1: return
#                 p_type = type_info[0]
            
#             # Huy tự định nghĩa độ dài Payload ở đây thay vì đọc từ STM32
#             if p_type == 0x05:   # ODOM: Yaw(2) + vL(4) + vR(4)
#                 p_len = 10
#             elif p_type == 0x04: # BATTERY: Pin(2) + Button(1)
#                 p_len = 3
#             else:
#                 # Nếu gặp Type lạ, quay lại tìm Header tiếp theo
#                 continue
#             # Đọc Payload + Checksum + Footer
#             remaining = self.ser.read(p_len + 2)
#             if len(remaining) < (p_len + 2): return
            
#             payload = remaining[:p_len]
#             footer = remaining[p_len + 1]

#             if footer == 0x55:
#                 if p_type == 0x05:
#                     # Yaw(h) + vL(f) + vR(f)
#                     yaw, vL, vR = struct.unpack('<hff', payload)
#                     self.update_odometry(vL, vR) # Tạm thời dùng vL làm v
#                 elif p_type == 0x04:
#                     raw_bat, btn_val = struct.unpack('<hB', payload)
#                     self.get_logger().info(f"Pin: {raw_bat}, Nut nhan: {btn_val}")
                    
#                     if btn_val == 1:
#                         self.get_logger().info("Da bat duoc tin hieu nut nhan!")
                        
#                         # Check xem co task khong, moi thu phai nam TRONG khoi if nay
#                         if hasattr(self, "current_task") and self.current_task is not None:
#                             task = self.current_task
                            
#                             # Thut le dong bo cho toan bo block done_data
#                             done_data = {
#                                 "robotId": str(task.get("robot_id", "")),
#                                 "docId": str(task.get("doc_id", "")),
#                                 "slot": int(task.get("slot", 0))
#                             }
                            
#                             done_msg = String()
#                             done_msg.data = json.dumps(done_data)
                            
#                             # Thuc hien publish len topic /robot/done
#                             self.done_pub.publish(done_msg)
#                             self.get_logger().info(f"Da tu dong publish /robot/done: Ngan {done_data['slot']} cho docId: {done_data['docId']}")
                        
#                         else:
#                             # Neu an nut ma khong co task thi canh bao
#                             self.get_logger().warn("Nhan duoc nut nhan nhung hien tai khong co task nao dang chay!")
#     def update_odometry(self, v, w):
#         current_time = self.get_clock().now()
#         dt = (current_time - self.last_time).nanoseconds / 1e9
#         self.last_time = current_time
    
#     # Tích phân vận tốc để tính toán vị trí (Odometry Kinematics)
#         # Giả sử robot di chuyển theo mô hình vi sai (Differential Drive)
#         delta_x = (v * math.cos(self.th)) * dt
#         delta_y = (v * math.sin(self.th)) * dt
#         delta_th = w * dt

#         self.x += delta_x
#         self.y += delta_y
#         self.th += delta_th

#         # 1. Tạo tin nhắn Quaternion từ góc Yaw (theta)
#         q = self.euler_to_quaternion(0, 0, self.th)

#         # 2. Publish TF (Để LiDAR khớp với vị trí robot trong không gian)
#         t = TransformStamped()
#         t.header.stamp = current_time.to_msg()
#         t.header.frame_id = 'odom'
#         t.child_frame_id = 'base_link'
#         t.transform.translation.x = self.x
#         t.transform.translation.y = self.y
#         t.transform.rotation = q
#         self.tf_broadcaster.sendTransform(t)

#         # 3. Publish Odom Topic
#         odom = Odometry()
#         odom.header.stamp = current_time.to_msg()
#         odom.header.frame_id = 'odom'
#         odom.child_frame_id = 'base_link'
#         odom.pose.pose.position.x = self.x
#         odom.pose.pose.position.y = self.y
#         odom.pose.pose.orientation = q
#         odom.twist.twist.linear.x = v
#         odom.twist.twist.angular.z = w
#         self.odom_pub.publish(odom)

#     def euler_to_quaternion(self, roll, pitch, yaw):
#         """Chuyển đổi góc Euler sang Quaternion chuẩn ROS 2"""
#         qx = math.sin(roll/2) * math.cos(pitch/2) * math.cos(yaw/2) - math.cos(roll/2) * math.sin(pitch/2) * math.sin(yaw/2)
#         qy = math.cos(roll/2) * math.sin(pitch/2) * math.cos(yaw/2) + math.sin(roll/2) * math.cos(pitch/2) * math.sin(yaw/2)
#         qz = math.cos(roll/2) * math.cos(pitch/2) * math.sin(yaw/2) - math.sin(roll/2) * math.sin(pitch/2) * math.cos(yaw/2)
#         qw = math.cos(roll/2) * math.cos(pitch/2) * math.cos(yaw/2) + math.sin(roll/2) * math.sin(pitch/2) * math.sin(yaw/2)
#         return Quaternion(x=qx, y=qy, z=qz, w=qw)
# def main(args=None):
#     rclpy.init(args=args)
#     node = SerialBridgeNode()
#     rclpy.spin(node)
#     node.destroy_node()
#     rclpy.shutdown()