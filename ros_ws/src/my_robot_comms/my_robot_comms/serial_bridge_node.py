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
import time
from tf_transformations import quaternion_from_euler
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
        self.last_button = 0
        
        # --- Biến định vị (Odometry) ---
        self.x = 0.0
        self.y = 0.0
        self.theta = 0.0

        self.vL_filtered = 0.0
        self.vR_filtered = 0.0

        self.prev_encL = 0
        self.prev_encR = 0

        self.v_cmd = 0
        self.w_cmd = 0

        self.prev_time = time.time()

        self.wheel_radius = 0.0425
        self.wheel_base = 0.292
        self.encoder_resolution = 330*2
        self.last_time = self.get_clock().now()


        # Publisher gửi trang thai nut nhan lên topic /robot/done
        self.done_pub = self.create_publisher(String, '/robot/done', 10)
        
        # Subscriber nhận lệnh vận tốc từ Nav2/Teleop
        self.subscription = self.create_subscription(Twist, 'cmd_vel', self.cmd_vel_callback, 10)

        self.uart_timer = self.create_timer(0.02, self.send_uart_periodic)
        
        # Subscriber nhận lệnh mở ngăn thuốc từ Mission Node
        self.delivery_sub = self.create_subscription(
            String,
            '/robot/delivery_info',
            self.on_delivery_info,
            10
        )
        # --- BẮT ĐẦU SỬA ĐỔI: ĐĂNG KÝ SUBSCRIBER CHO TOPIC ĐIỀU KHIỂN ĐÓNG NẮP RIÊNG BIỆT ---
        self.close_sub = self.create_subscription(
            String,
            '/robot/close',
            self.close_callback,
            10
        )
        # --- KẾT THÚC SỬA ĐỔI ---
                
        # Publisher gửi Odometry và Pin lên ROS 2
        self.odom_pub = self.create_publisher(Odometry, 'odom', 10)
        self.battery_pub = self.create_publisher(Float32, 'battery_status', 10)
        self.battery_pub = self.create_publisher(
            String,
            '/robot/battery',
            10
        )
        self.confirm_pub = self.create_publisher(
            Bool,
            'patient_confirm',
            10
        )
        # Để robot hiện trên Rviz, cần một Broadcaster để gửi tọa độ TF
        self.tf_broadcaster = TransformBroadcaster(self)
        
        # Timer đọc dữ liệu từ STM32 (Uplink) - 20Hz
        self.timer = self.create_timer(0.05, self.receive_from_stm32)
        
        self.get_logger().info(f'Serial Bridge Node started on {port}')

    def calculate_checksum(self, payload):
        # Tổng các byte trong payload (Type + Len + Data)
        return sum(payload) & 0xFF

    def cmd_vel_callback(self, msg):
        # HÀM NÀY BÂY GIỜ CHỈ LÀM NHIỆM VỤ CẤT SỐ VÀO KHO, KHÔNG GỬI UART TẠI ĐÂY!
        self.v_cmd = msg.linear.x
        self.w_cmd = msg.angular.z

    def send_uart_periodic(self):
        # 1. Lấy v và w
        v = self.v_cmd
        w = self.w_cmd
        
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
            
    def drug_callback(self, msg):
        try:
            # 1. Giải mã dữ liệu JSON từ Web gửi xuống thông qua topic
            data_json = json.loads(msg.data)
            
            # 2. Lấy và ép kiểu ID ngăn thuốc (slot) sang số nguyên
            comp_id = int(data_json['slot']) 
            name_raw = str(data_json.get('name', ''))
            
            # 3. Xử lý số giường (bed) - Lọc bỏ chữ "Giường/Giuong"
            bed_raw = str(data_json['bed'])
            bed_cleaned = bed_raw.replace("Giường", "").replace("giường", "")
            bed_cleaned = bed_cleaned.replace("Giuong", "").replace("giuong", "").strip()
            bed_no_accent = self.remove_accents(bed_cleaned)
            bed = bed_no_accent.ljust(5, '\0')[:5].encode('ascii')
            
            # 4. Lấy tên bệnh nhân, xóa dấu tiếng Việt và ép về cố định 20 ký tự
            name_no_accent = self.remove_accents(name_raw)
            name = name_no_accent.ljust(20, '\0')[:20].encode('ascii')
            
            # 5. Đóng gói dữ liệu Payload (Độ dài chuẩn: 1 + 5 + 20 = 26 byte)
            data = bytearray([comp_id]) + bed + name
            header = [0xAA, 0x02, 0x1A]
            checksum = self.calculate_checksum(header[1:] + list(data))
            packet = bytearray(header) + data + bytearray([checksum, 0x55])
            
            # 6. Gửi gói tin xuống STM32
            self.ser.write(packet)
            self.get_logger().info(
                f"Da gui lenh mo ngan {comp_id} - Giuong TFT: {bed_no_accent[:5]} - Ten TFT: {name_no_accent[:5]}"
            )

        except Exception as e:
            self.get_logger().error(f"Drug command error: {e}")

    # --- BẮT ĐẦU SỬA ĐỔI: THÊM CALLBACK XỬ LÝ LỆNH ĐÓNG NẮP RIÊNG BIỆT (TYPE 0x08) ---
    def close_callback(self, msg: String):
        try:
            data = json.loads(msg.data)
            slot = int(data.get("slot", 0))
            
            # Gửi lệnh đóng nắp Type 0x08 (độ dài payload: 1 byte là ID ngăn)
            header = [0xAA, 0x08, 0x01]
            payload = bytearray([slot])
            checksum = self.calculate_checksum(header[1:] + list(payload))
            packet = bytearray(header) + payload + bytearray([checksum, 0x55])
            
            self.ser.write(packet)
            self.get_logger().info(f"🔑 Đã gửi lệnh ĐÓNG ngăn thuốc {slot} xuống STM32 (Type 0x08)")
                
        except Exception as e:
            self.get_logger().error(f"Lỗi trong close_callback: {e}")
    # --- KẾT THÚC SỬA ĐỔI ---
    def on_delivery_info(self, msg: String):

        try:
            data = json.loads(msg.data)

            # lưu task hiện tại
            self.current_task = {
                "robot_id": self.robot_id,
                "doc_id": data.get("docId"),
                "slot": data.get("slot")
            }

            self.get_logger().info(
                f"📦 Current task = {self.current_task}"
            )

            # gửi packet TFT + servo
            self.drug_callback(msg)

        except Exception as e:

            self.get_logger().error(
                f"Delivery info error: {e}"
            )

    # def receive_from_stm32(self):
    #     # Logic nhận Uplink từ STM32 (Odom, Pin, Button)
    #     while self.ser.in_waiting > 0:
    #         header = self.ser.read(1)
    #         if header == b'\xaa':
    #             type_info = self.ser.read(1)
    #             if len(type_info) < 1: return
    #             p_type = type_info[0]
            
    #         # Huy tự định nghĩa độ dài Payload ở đây thay vì đọc từ STM32
    #         if p_type == 0x05:   # ODOM: Yaw(2) + vL(4) + vR(4)
    #             p_len = 10
    #         elif p_type == 0x04: # BATTERY: Pin(2) + Button(1)
    #             p_len = 3
    #         else:
    #             # Nếu gặp Type lạ, quay lại tìm Header tiếp theo
    #             continue
    #         # Đọc Payload + Checksum + Footer
    #         remaining = self.ser.read(p_len + 2)
    #         if len(remaining) < (p_len + 2): return
            
    #         payload = remaining[:p_len]
    #         footer = remaining[p_len + 1]

    #         if footer == 0x55:
    #             if p_type == 0x05:
    #                 # Yaw(h) + vL(f) + vR(f)
    #                 yaw, vL, vR = struct.unpack('<hff', payload)
    #                 self.update_odometry(vL, vR) # Tạm thời dùng vL làm v
    #             elif p_type == 0x04:
    #                 raw_bat, btn_val = struct.unpack('<hB', payload)
    #                 self.get_logger().info(f"Pin: {raw_bat}, Nut nhan: {btn_val}")
                    
    #                 if btn_val == 1:
    #                     self.get_logger().info("Da bat duoc tin hieu nut nhan!")
                        
    #                     # Check xem co task khong, moi thu phai nam TRONG khoi if nay
    #                     if hasattr(self, "current_task") and self.current_task is not None:
    #                         task = self.current_task
                            
    #                         # Thut le dong bo cho toan bo block done_data
    #                         done_data = {
    #                             "robotId": str(task.get("robot_id", "")),
    #                             "docId": str(task.get("doc_id", "")),
    #                             "slot": int(task.get("slot", 0))
    #                         }
                            
    #                         done_msg = String()
    #                         done_msg.data = json.dumps(done_data)
                            
    #                         # Thuc hien publish len topic /robot/done
    #                         self.done_pub.publish(done_msg)
    #                         self.get_logger().info(f"Da tu dong publish /robot/done: Ngan {done_data['slot']} cho docId: {done_data['docId']}")
                        
    #                     else:
    #                         # Neu an nut ma khong co task thi canh bao
    #                         self.get_logger().warn("Nhan duoc nut nhan nhung hien tai khong co task nao dang chay!")
    # def receive_from_stm32(self):

    #     # =========================
    #     # DEBUG RAW UART
    #     # =========================

    #     data = self.ser.read_all()

    #     if not data:
    #         return

    #     self.get_logger().info(
    #         f"RAW: {' '.join(f'{b:02X}' for b in data)}"
    #     )

    #     # =========================
    #     # PARSE UART STREAM
    #     # =========================

    #     i = 0

    #     while i < len(data):

    #         # tìm HEADER
    #         if data[i] != 0xAA:
    #             i += 1
    #             continue

    #         # cần tối thiểu:
    #         # AA TYPE PAYLOAD CHECKSUM 55
    #         if i + 1 >= len(data):
    #             break

    #         # =========================
    #         # READ TYPE
    #         # =========================

    #         p_type = data[i + 1]

    #         # =========================
    #         # PACKET TYPE 0x04
    #         # BATTERY + BUTTON
    #         # FORMAT:
    #         # AA 04 BAT_L BAT_H BTN CHECKSUM 55
    #         # =========================

    #         if p_type == 0x04:

    #             packet_size = 7

    #             if i + packet_size > len(data):
    #                 break

    #             packet = data[i:i + packet_size]

    #             footer = packet[6]

    #             if footer != 0x55:

    #                 self.get_logger().warn(
    #                     "Footer error 0x04"
    #                 )

    #                 i += 1
    #                 continue

    #             payload = packet[2:5]

    #             checksum_received = packet[5]

    #             # checksum = TYPE + PAYLOAD
    #             checksum_calculated = self.calculate_checksum(
    #                 [0x04] + list(payload)
    #             )

    #             if checksum_received != checksum_calculated:

    #                 self.get_logger().warn(
    #                     f"Checksum error 0x04 "
    #                     f"recv={checksum_received:02X} "
    #                     f"calc={checksum_calculated:02X}"
    #                 )

    #                 i += 1
    #                 continue

    #             # unpack
    #             raw_bat, btn_val = struct.unpack(
    #                 '<hB',
    #                 bytes(payload)
    #             )

    #             self.get_logger().info(
    #                 f"Pin: {raw_bat}, Nut nhan: {btn_val}"
    #             )

    #             # debounce
    #             if btn_val == 1 and self.last_button == 0:

    #                 self.get_logger().info(
    #                     "Da bat duoc tin hieu nut nhan!"
    #                 )

    #                 if hasattr(self, "current_task") and self.current_task is not None:

    #                     task = self.current_task

    #                     done_data = {
    #                         "robotId": str(task.get("robot_id", "")),
    #                         "docId": str(task.get("doc_id", "")),
    #                         "slot": int(task.get("slot", 0))
    #                     }

    #                     done_msg = String()

    #                     done_msg.data = json.dumps(
    #                         done_data
    #                     )

    #                     self.done_pub.publish(done_msg)

    #                     self.get_logger().info(
    #                         f"Published /robot/done: {done_data}"
    #                     )

    #                 else:

    #                     self.get_logger().warn(
    #                         "Khong co current_task"
    #                     )

    #             self.last_button = btn_val

    #             i += packet_size
    #             continue

    #         # =========================
    #         # PACKET TYPE 0x05
    #         # ODOM
    #         # FORMAT:
    #         # AA 05 payload(10) checksum 55
    #         # =========================

    #         elif p_type == 0x05:

    #             packet_size = 14

    #             if i + packet_size > len(data):
    #                 break

    #             packet = data[i:i + packet_size]

    #             footer = packet[13]

    #             if footer != 0x55:

    #                 self.get_logger().warn(
    #                     "Footer error 0x05"
    #                 )

    #                 i += 1
    #                 continue

    #             payload = packet[2:12]

    #             checksum_received = packet[12]

    #             checksum_calculated = self.calculate_checksum(
    #                 [0x05] + list(payload)
    #             )

    #             if checksum_received != checksum_calculated:

    #                 self.get_logger().warn(
    #                     f"Checksum error 0x05 "
    #                     f"recv={checksum_received:02X} "
    #                     f"calc={checksum_calculated:02X}"
    #                 )

    #                 i += 1
    #                 continue

    #             yaw, vL, vR = struct.unpack(
    #                 '<hff',
    #                 bytes(payload)
    #             )

    #             self.update_odometry(vL, vR)

    #             i += packet_size
    #             continue

    #         else:

    #             # unknown type
    #             i += 1
    # def receive_from_stm32(self):

    #     data = self.ser.read_all()

    #     if data:

    #         hex_str = ' '.join(f'{b:02X}' for b in data)

    #         self.get_logger().info(
    #             f"RAW UART: {hex_str}"
    #         )
    def receive_from_stm32(self):

        while self.ser.in_waiting > 0:

            # =========================
            # HEADER
            # =========================

            header = self.ser.read(1)

            if header != b'\xAA':
                continue

            # =========================
            # TYPE
            # =========================

            type_info = self.ser.read(1)

            if len(type_info) < 1:
                continue

            p_type = type_info[0]

            # =========================
            # LENGTH
            # =========================

            len_info = self.ser.read(1)

            if len(len_info) < 1:
                continue

            p_len = len_info[0]

            # chống packet rác
            if p_len > 64:
                continue

            # =========================
            # READ PAYLOAD + CHECKSUM + FOOTER
            # =========================

            remaining = self.ser.read(p_len + 2)

            if len(remaining) < (p_len + 2):
                continue

            payload = remaining[:p_len]

            checksum_received = remaining[p_len]

            footer = remaining[p_len + 1]

            # =========================
            # FOOTER CHECK
            # =========================

            if footer != 0x55:

                self.get_logger().warn(
                    f"Footer error: {footer:02X}"
                )

                continue

            # =========================
            # CHECKSUM CHECK
            # =========================

            checksum_calculated = self.calculate_checksum(
                [p_type, p_len] + list(payload)
            )

            if checksum_received != checksum_calculated:

                self.get_logger().warn(
                    f"Checksum error recv={checksum_received:02X} "
                    f"calc={checksum_calculated:02X}"
                )

                continue

            # =========================
            # TYPE 0x05 -> ODOM
            # =========================

            if p_type == 0x05:

                if p_len != 12:
                    continue

                yaw_raw, encL, encR = struct.unpack(
                    '<fii',
                    payload
                )
                # self.get_logger().info(
                #     f"yaw:{yaw_raw} L:{encL} R:{encR}"
                # )
               

                # dt = current_time - self.prev_time

                # self.prev_time = current_time
                # deltaL = encL - self.prev_encL
                # deltaR = encR - self.prev_encR

                # self.prev_encL = encL
                # self.prev_encR = encR
                # distL = (
                #     2.0 * math.pi * self.wheel_radius
                #     * deltaL
                # ) / self.encoder_resolution

                # distR = (
                #     2.0 * math.pi * self.wheel_radius
                #     * deltaR
                # ) / self.encoder_resolution
                # vL = distL / dt
                # vR = distR / dt
                # v = (vR + vL) / 2.0

                # omega = (vR - vL) / self.wheel_base
                # yaw = yaw_raw / 1000.0

                # self.theta = yaw
                # self.x += v * math.cos(self.theta) * dt

                # self.y += v * math.sin(self.theta) * dt
                # odom = Odometry()

                # odom.header.stamp = self.get_clock().now().to_msg()

                # odom.header.frame_id = "odom"

                # odom.child_frame_id = "base_link"
                # q = quaternion_from_euler(
                #     0,
                #     0,
                #     self.theta
                # )


                # odom.pose.pose.orientation.x = q[0]
                # odom.pose.pose.orientation.y = q[1]
                # odom.pose.pose.orientation.z = q[2]
                # odom.pose.pose.orientation.w = q[3]
                # odom.twist.twist.linear.x = float(v)

                # odom.twist.twist.angular.z = float(omega)
                # self.odom_pub.publish(odom)

                # self.update_odometry(encL, encR)
                

                current_time = self.get_clock().now().nanoseconds * 1e-9
                dt = current_time - self.prev_time
                self.prev_time = current_time

                if dt <= 0:
                    return
        

                # =========================
                # encL, encR = DELTA ticks
                # =========================
                deltaL = encL
                deltaR = encR

                # distance
                distL = (2.0 * math.pi * self.wheel_radius * deltaL) / self.encoder_resolution
                distR = (2.0 * math.pi * self.wheel_radius * deltaR) / self.encoder_resolution
                # self.get_logger().info(
                #     f"distL:{distL}, distR:{distR} "
                # )
                vL = distL / dt
                vR = distR / dt

                alpha = 0.8

                self.vL_filtered = (
                    alpha * self.vL_filtered
                    + (1.0 - alpha) * vL
                )

                self.vR_filtered = (
                    alpha * self.vR_filtered
                    + (1.0 - alpha) * vR
                )
                # self.get_logger().info(
                #     f"vL:{self.vL_filtered:.2f}, vR:{self.vR_filtered:.2f}"
                # )
                delta_s = (distR + distL) / 2.0
                # delta_theta = (distR - distL) / self.wheel_base
                self.theta = yaw_raw

                # velocity
                # v = delta_s / dt
                v = (self.vL_filtered + self.vR_filtered) / 2.0
                # omega = delta_theta / dt
                omega = (self.vR_filtered - self.vL_filtered) / self.wheel_base
                # odom integration
                # self.theta += omega * dt
                # avg_theta = self.theta + (delta_theta / 2.0)
                avg_theta = self.theta 

                self.x += delta_s * math.cos(avg_theta)
                self.y += delta_s * math.sin(avg_theta)

                self.get_logger().info(
                f"x:{self.x:.2f} y:{self.y:.2f} yaw:{math.degrees(self.theta):.1f}" 
                )

                # self.theta += delta_theta


                odom = Odometry()
                odom.header.stamp = self.get_clock().now().to_msg()
                odom.header.frame_id = "odom"
                odom.child_frame_id = "base_footprint"

                odom.pose.pose.position.x = self.x
                odom.pose.pose.position.y = self.y

                q = quaternion_from_euler(0, 0, self.theta)
                odom.pose.pose.orientation.x = q[0]
                odom.pose.pose.orientation.y = q[1]
                odom.pose.pose.orientation.z = q[2]
                odom.pose.pose.orientation.w = q[3]

                odom.twist.twist.linear.x = v
                odom.twist.twist.angular.z = omega

                self.odom_pub.publish(odom)

                t = TransformStamped()
                t.header.stamp = self.get_clock().now().to_msg()
                t.header.frame_id = "odom"
                t.child_frame_id = "base_footprint"
                t.transform.translation.x = self.x
                t.transform.translation.y = self.y
                t.transform.translation.z = 0.0
              
                t.transform.rotation.x = q[0]
                t.transform.rotation.y = q[1]
                t.transform.rotation.z = q[2]
                t.transform.rotation.w = q[3]

                self.tf_broadcaster.sendTransform(t)
                            

                 
            # =========================
            # TYPE 0x04 -> BATTERY + BUTTON
            # =========================

            elif p_type == 0x04:

                if p_len != 2:
                    continue

                # raw_bat = struct.unpack('<h', payload)[0]
                percent = struct.unpack('<H', payload)[0]

                msg = String()
                msg.data = str(percent)

                self.battery_pub.publish(msg)

                self.get_logger().info(f"Battery: {percent}%")
                # self.get_logger().info(
                #     f"Pin: {raw_bat}"
                # )

            elif p_type == 0x06:
                # debounce
                btn_val = struct.unpack('<B', payload)[0]
                if btn_val == 1 and self.last_button == 0:

                    self.get_logger().info(
                        "Da bat duoc tin hieu nut nhan!"
                    )

                    if hasattr(self, "current_task") and self.current_task is not None:

                        task = self.current_task

                        done_data = {
                            "robotId": str(task.get("robot_id", "")),
                            "docId": str(task.get("doc_id", "")),
                            "slot": int(task.get("slot", 0))
                        }

                        done_msg = String()

                        done_msg.data = json.dumps(
                            done_data
                        )

                        self.done_pub.publish(done_msg)

                        self.get_logger().info(
                            f"Published /robot/done: {done_data}"
                        )
                        self.current_task = None
                    else:

                        self.get_logger().warn(
                            "Khong co current_task"
                        )

                self.last_button = btn_val
    # def update_odometry(self, v, w):
    #     current_time = self.get_clock().now()
    #     dt = (current_time - self.last_time).nanoseconds / 1e9
    #     self.last_time = current_time
    
    # # Tích phân vận tốc để tính toán vị trí (Odometry Kinematics)
    #     # Giả sử robot di chuyển theo mô hình vi sai (Differential Drive)
    #     delta_x = (v * math.cos(self.th)) * dt
    #     delta_y = (v * math.sin(self.th)) * dt
    #     delta_th = w * dt

    #     self.x += delta_x
    #     self.y += delta_y
    #     self.th += delta_th

    #     # 1. Tạo tin nhắn Quaternion từ góc Yaw (theta)
    #     q = self.euler_to_quaternion(0, 0, self.th)

    #     # 2. Publish TF (Để LiDAR khớp với vị trí robot trong không gian)
    #     t = TransformStamped()
    #     t.header.stamp = current_time.to_msg()
    #     t.header.frame_id = 'odom'
    #     t.child_frame_id = 'base_link'
    #     t.transform.translation.x = self.x
    #     t.transform.translation.y = self.y
    #     t.transform.rotation = q
    #     self.tf_broadcaster.sendTransform(t)

    #     # 3. Publish Odom Topic
    #     odom = Odometry()
    #     odom.header.stamp = current_time.to_msg()
    #     odom.header.frame_id = 'odom'
    #     odom.child_frame_id = 'base_link'
    #     odom.pose.pose.position.x = self.x
    #     odom.pose.pose.position.y = self.y
    #     odom.pose.pose.orientation = q
    #     odom.twist.twist.linear.x = v
    #     odom.twist.twist.angular.z = w
    #     self.odom_pub.publish(odom)

    # def euler_to_quaternion(self, roll, pitch, yaw):
    #     """Chuyển đổi góc Euler sang Quaternion chuẩn ROS 2"""
    #     qx = math.sin(roll/2) * math.cos(pitch/2) * math.cos(yaw/2) - math.cos(roll/2) * math.sin(pitch/2) * math.sin(yaw/2)
    #     qy = math.cos(roll/2) * math.sin(pitch/2) * math.cos(yaw/2) + math.sin(roll/2) * math.cos(pitch/2) * math.sin(yaw/2)
    #     qz = math.cos(roll/2) * math.cos(pitch/2) * math.sin(yaw/2) - math.sin(roll/2) * math.sin(pitch/2) * math.cos(yaw/2)
    #     qw = math.cos(roll/2) * math.cos(pitch/2) * math.cos(yaw/2) + math.sin(roll/2) * math.sin(pitch/2) * math.sin(yaw/2)
    #     return Quaternion(x=qx, y=qy, z=qz, w=qw)
def main(args=None):
    rclpy.init(args=args)
    node = SerialBridgeNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()
