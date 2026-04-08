from pydantic import BaseModel

class Baterryupdate(BaseModel):
    battery_level: int
class SpeedUpdateModel(BaseModel):
    speed: int