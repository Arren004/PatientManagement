from setuptools import find_packages, setup

package_name = 'my_robot_comms'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        # THÊM DÒNG NÀY ĐỂ ROS2 TÌM THẤY FILE LAUNCH
        ('share/' + package_name + '/launch', ['launch/receiver.launch.py']), 
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='huy',
    maintainer_email='huy@todo.todo',
    description='TODO: Package description',
    license='TODO: License declaration',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'serial_bridge = my_robot_comms.serial_bridge_node:main',
            'web_receiver = my_robot_comms.web_receiver:main',
            'handle_data_web = my_robot_comms.handle_data_web:main'
        ],
    },
)
