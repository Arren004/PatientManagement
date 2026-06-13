#ros2 interface show example_interfaces/msg/String


import rclpy
from rclpy.node import Node
from example_interfaces.msg import String

class Robotstation(Node):
    def __init__(self):
        super().__init__("robot_station")
        self.publishers_ = self.create_publisher(String,"robot_news",10)
        self.timer_ = self.create_timer(0.5,self.publish_news)
        self.get_logger().info("Robot has been Started")
    
    def publish_news(self):
        msg = String()
        msg.data = "Hello, I am PhamQuangHuy!"
        self.publishers_.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = Robotstation()
    rclpy.spin(node)
    rclpy.shutdown()

if __name__=="__main__":
    main()