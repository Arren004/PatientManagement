#ros2 interface show example_interfaces/msg/String


import rclpy
from rclpy.node import Node
from example_interfaces.srv import AddTwoInts
from time import sleep


# class AddTwoIntsClientNode(Node):
#     def __init__(self):
#         super().__init__("add_two_ints_client")
#         self.client_ = self.create_client(AddTwoInts, "add_two_ints")
#         self.get_logger().info("Add Two Ints Client has been Started")
    
#     def add_two_ints_callback(self, request:AddTwoInts.Request, response:AddTwoInts.Response):
#         response.sum = request.a + request.b
#         self.get_logger().info(f"Incoming request: a={request.a}, b={request.b}, sum={response.sum}")
#         return response
    
def main(args=None):
    rclpy.init(args=args)
    node = Node("add_two_ints_client")
    client_ = node.create_client(AddTwoInts, "add_two_ints")
    while not client_.wait_for_service(timeout_sec=1.0):
        node.get_logger().warn("Service not available, waiting again...")
    while True:
        request = AddTwoInts.Request()
        request.a = 1
        request.b = 2
        future = client_.call_async(request)
        rclpy.spin_until_future_complete(node, future)
        response = future.result()
        node.get_logger().info(f"Result of {request.a} + {request.b} = {response.sum}")
        sleep(5)
    rclpy.shutdown()

if __name__=="__main__":
    main()