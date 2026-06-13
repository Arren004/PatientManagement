from contextlib import asynccontextmanager
from fastapi import FastAPI


from routers import robot, health
import rosbridge_client as mqtt
from routers.robot import subscribe_battery, start_backend_heartbeat_publisher, start_speed_watcher, subscribe_robot_state
from db_client import db
from routers.delivery import start_delivery_command_watcher, start_robot_feedback_subscriber

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi tạo MQTT client và subscribe khi server khởi động
    client = mqtt.connect_mqtt()
    subscribe_battery(client)
    subscribe_robot_state(client)
    client.loop_start()

    def get_all_robot_ids():
        robots_ref = db.collection('robots')
        docs = robots_ref.stream()
        return [doc.id for doc in docs]

    robot_ids = get_all_robot_ids()
    for rid in robot_ids:
        start_speed_watcher(rid, client)
        start_backend_heartbeat_publisher(rid, client)
        start_robot_feedback_subscriber(client, rid)

    # Khởi động watcher đơn hàng (delivery) qua module routers.delivery
    start_delivery_command_watcher(client)
    
    yield
    # Dọn dẹp kết nối khi server dừng
    try:
        client.loop_stop()
        client.disconnect()
    except Exception:
        pass

app = FastAPI(lifespan=lifespan)

app.include_router(robot.router)
app.include_router(health.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

