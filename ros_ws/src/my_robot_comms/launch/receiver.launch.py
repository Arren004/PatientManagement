from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():

    return LaunchDescription([

        Node(
            package="my_robot_comms",
            executable="web_receiver",
            name="mqtt_receiver",
            output="screen",
            parameters=[
                {
                    "broker": "broker.emqx.io",
                    "port": 1883,
                    "mqtt_topic": "/robots/+/#",
                    "ros_topic": "/mqtt/incoming",
                }
            ],
        ),

        Node(
            package="my_robot_comms",
            executable="serial_bridge",
            name="serial_bridge",
            output="screen",
        ),

        Node(
            package="my_robot_comms",
            executable="handle_data_web",
            name="handle_data_web",
            output="screen",
        ),

        # Node(
        #     package="ros_mqtt_receiver",
        #     executable="uart_bridge",
        #     name="uart_bridge",
        #     output="screen",
        # ),



    ])