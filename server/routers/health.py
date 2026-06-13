from fastapi import APIRouter

import rosbridge_client

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_root():
    mqtt_status = rosbridge_client.get_mqtt_health()
    return {
        "status": "ok",
        "mqtt": mqtt_status,
    }


@router.get("/mqtt")
async def health_mqtt():
    return rosbridge_client.get_mqtt_health()
