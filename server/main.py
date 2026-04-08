from fastapi import FastAPI

from routers import robot
import rosbridge_client as mqtt
from routers.robot import  subscribe_battery, start_speed_watcher
from firebase_client import db
app = FastAPI()


# Khởi tạo MQTT client và subscribe khi server khởi động
client = mqtt.connect_mqtt()
subscribe_battery(client)
client.loop_start()
def get_all_robot_ids():
	robots_ref = db.collection('robots')
	docs = robots_ref.stream()
	return [doc.id for doc in docs]

robot_ids = get_all_robot_ids()
for rid in robot_ids:
	start_speed_watcher(rid, client)

app.include_router(robot.router)

