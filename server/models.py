from pydantic import BaseModel
from typing import Any

class Baterryupdate(BaseModel):
    battery_level: int


class SpeedUpdateModel(BaseModel):
    """Legacy: tốc độ theo phần trăm (MQTT/Firestore cũ)."""
    speed: int


class VelocityUpdateModel(BaseModel):
    v: float
    w: float


class BridgePublishRequest(BaseModel):
    topic: str
    payload: Any