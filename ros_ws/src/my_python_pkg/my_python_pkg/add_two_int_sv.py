#ros2 interface show example_interfaces/msg/String


import rclpy
from rclpy.node import Node
from example_interfaces.srv import AddTwoInts


class AddTwoIntsSVNode(Node):
    def __init__(self):
        super().__init__("add_two_ints_sv")
        self.server_ = self.create_service(AddTwoInts, "add_two_ints", self.add_two_ints_callback)
        self.get_logger().info("Add Two Ints Service has been Started")
    
    def add_two_ints_callback(self, request:AddTwoInts.Request, response:AddTwoInts.Response):
        response.sum = request.a + request.b
        self.get_logger().info(f"Incoming request: a={request.a}, b={request.b}, sum={response.sum}")
        return response
    

def main(args=None):
    rclpy.init(args=args)
    node = AddTwoIntsSVNode()
    rclpy.spin(node)
    rclpy.shutdown()

if __name__=="__main__":
    main()