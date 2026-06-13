# ROS2 MQTT Topic Spec (Smart Hospital)

Phiên bản hiện tại: `schemaVersion = "1.0"`

Mọi payload khuyến nghị dùng envelope chuẩn:

```json
{
  "schemaVersion": "1.0",
  "eventType": "<event>",
  "source": "backend|robot",
  "timestamp": "2026-04-28T10:20:30.000000+00:00",
  "data": { }
}
```

## 1) Backend -> Robot

### 1.1 Delivery command
- Topic: `/robots/{robotId}/delivery`
- QoS: `1`
- `eventType`: `delivery.command`

Ví dụ:

```json
{
  "schemaVersion": "1.0",
  "eventType": "delivery.command",
  "source": "backend",
  "timestamp": "2026-04-28T10:20:30.000000+00:00",
  "data": {
    "docId": "deliveryCmd123",
    "robotId": "robot_01",
    "slot": 2,
    "name": "Nguyen Van A",
    "room": "101",
    "bed": "Giường 2",
    "position": { "x": 1.2, "y": 3.4, "theta": 0.0 },
    "note": "Sau ăn"
  }
}
```

### 1.2 Speed command
- Topic: `/robots/{robotId}/speed`
- QoS: `1`
- `eventType`: `robot.speed.command`

Ví dụ:

```json
{
  "schemaVersion": "1.0",
  "eventType": "robot.speed.command",
  "source": "backend",
  "timestamp": "2026-04-28T10:21:00.000000+00:00",
  "data": {
    "robotId": "robot_01",
    "v": 0.8,
    "w": 1.2
  }
}
```

Ghi chú: robot / backend cũ có thể gửi `"speed": 40` (0–100). Node ROS vẫn chấp nhận và quy đổi nội bộ sang `v`, `w`.

### 1.3 Backend heartbeat
- Topic: `/robots/{robotId}/heartbeat`
- QoS: `1`
- `eventType`: `backend.heartbeat`
- Chu kỳ backend hiện tại: khoảng `10s`

Ví dụ:

```json
{
  "schemaVersion": "1.0",
  "eventType": "backend.heartbeat",
  "source": "backend",
  "timestamp": "2026-04-28T10:21:10.000000+00:00",
  "data": {
    "robotId": "robot_01"
  }
}
```

## 2) Robot -> Backend

### 2.1 Delivered feedback
- Topic: `/robots/{robotId}/delivered`
- QoS: `1`
- `eventType`: `delivery.feedback`

Ví dụ:

```json
{
  "schemaVersion": "1.0",
  "eventType": "delivery.feedback",
  "source": "robot",
  "timestamp": "2026-04-28T10:22:00.000000+00:00",
  "data": {
    "docId": "deliveryCmd123",
    "slot": 2,
    "status": "delivered"
  }
}
```

### 2.2 Battery telemetry
- Topic: `/robots/{robotId}/battery`
- QoS: `1`
- `eventType`: `robot.battery`

Ví dụ:

```json
{
  "schemaVersion": "1.0",
  "eventType": "robot.battery",
  "source": "robot",
  "timestamp": "2026-04-28T10:22:20.000000+00:00",
  "data": {
    "battery_level": 76
  }
}
```

### 2.3 State telemetry
- Topic: `/robots/{robotId}/state`
- QoS: `1`
- `eventType`: `robot.state`

Ví dụ:

```json
{
  "schemaVersion": "1.0",
  "eventType": "robot.state",
  "source": "robot",
  "timestamp": "2026-04-28T10:22:40.000000+00:00",
  "data": {
    "mode": "navigating",
    "currentTask": "delivery",
    "pose": { "x": 1.05, "y": 2.18, "theta": 0.1 },
    "error": null
  }
}
```

## 3) Backward compatibility
- Backend hiện tại vẫn chấp nhận payload không có envelope cho một số luồng cũ (vd `delivered`, `battery`).
- Khuyến nghị robot mới dùng đầy đủ envelope để dễ debug và versioning.

## 4) Health endpoints
- `GET /health`
- `GET /health/mqtt`
- `GET /health/bridge`

Dùng để kiểm tra nhanh trạng thái MQTT và ROS2 bridge trong backend.
