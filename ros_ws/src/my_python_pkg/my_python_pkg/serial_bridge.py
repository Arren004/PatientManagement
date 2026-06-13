#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
import serial

class SerialBridge(Node):
    def __init__(self):
        self.ser = serial.Serial('/dev/ttyAMA0', 115200, timeout=1)
        super().__init__("serial_bridge_node")
        self.subcriber_ = self.create_subscription(Twist,"cmd_vel",self.listener_callback,10)
        self.get_logger().info("Serial_bridge_node is started")
    
    def listener_callback(self, msg: Twist):
        linear_x = msg.linear.x
        angular_z = msg.angular.z
        self.get_logger().info(f'Nhận lệnh tuyến tính x = {linear_x:.2f}, Góc z = {angular_z:.2f}')
        send_data = f"v{linear_x:.2f}w{angular_z:.2f}\n"
        self.ser.write(send_data.encode('utf-8'))
        self.get_logger().info(f'Đã gửi xuống STM32: {send_data.strip()}')

def main(args=None):
    rclpy.init(args=args)
    node = SerialBridge()
    rclpy.spin(node)
    rclpy.shutdown()

if __name__=="__main__":
    main()