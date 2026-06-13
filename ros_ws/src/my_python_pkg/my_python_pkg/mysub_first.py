#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from example_interfaces.msg import String

class Mydevidenode(Node):
    def __init__(self):
        super().__init__("Laptop")
        self.subcriber_ = self.create_subscription(String,"robot_news",self.callback_robot_news,10)
    
    def callback_robot_news(self, msg: String):
        self.get_logger().info(msg.data)


def main(args=None):
    rclpy.init(args=args)
    node = Mydevidenode()
    rclpy.spin(node)
    rclpy.shutdown()

if __name__=="__main__":
    main()