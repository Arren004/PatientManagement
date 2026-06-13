from setuptools import find_packages, setup

package_name = 'my_python_pkg'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
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
            "robot_station = my_python_pkg.mypub_first:main",
            "Laptop = my_python_pkg.mysub_first:main",
            "add_two_ints_sv = my_python_pkg.add_two_int_sv:main",
            "add_two_int_client = my_python_pkg.add_two_int_client:main",
            "serial_bridge = my_python_pkg.serial_bridge:main"
        ],
    },
)
