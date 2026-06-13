from datetime import datetime, timezone

SCHEMA_VERSION = "1.0"

QOS_COMMAND = 1
QOS_FEEDBACK = 1
QOS_TELEMETRY = 1


def topic_delivery(robot_id: str) -> str:
    return f"/robots/{robot_id}/delivery"


def topic_speed(robot_id: str) -> str:
    return f"/robots/{robot_id}/speed"


def topic_battery(robot_id: str) -> str:
    return f"/robots/{robot_id}/battery"


def topic_delivered(robot_id: str) -> str:
    return f"/robots/{robot_id}/delivered"


def topic_heartbeat(robot_id: str) -> str:
    return f"/robots/{robot_id}/heartbeat"


def topic_state(robot_id: str) -> str:
    return f"/robots/{robot_id}/state"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def envelope(event_type: str, data: dict, source: str = "backend") -> dict:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "eventType": event_type,
        "source": source,
        "timestamp": now_iso(),
        "data": data,
    }
