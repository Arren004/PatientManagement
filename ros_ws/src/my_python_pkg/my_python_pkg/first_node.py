#!/usr/bin/env python3
import rclpy
from rclpy.node import Node

class Mynode(Node):
    def __init__(self):
        super().__init__("quang_huy_mynode")
        self.counter = 0
        self.get_logger().info("hello_word")
        self.create_timer(1,self.timer_callback)

    def timer_callback(self):
        self.counter += 1
        self.get_logger().info(f'quanghuy[{str(self.counter)}]')

def main(args=None):
    rclpy.init(args=args)
    node = Mynode()
    rclpy.spin(node)
    rclpy.shutdown()

if __name__=="__main__":
    main()