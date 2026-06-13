# MQTT E2E Test Quick Guide

## 1) Start backend

```bash
cd server
uvicorn main:app --reload
```

## 2) Check backend health

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/health/mqtt
```

## 3) Publish test packets

### 3.1 Backend command simulation

```bash
python mqtt_e2e_test.py --mode backend-command --robot-id robot_01
```

### 3.2 Robot feedback simulation

```bash
python mqtt_e2e_test.py --mode robot-feedback --robot-id robot_01
```

### 3.3 Robot battery telemetry simulation

```bash
python mqtt_e2e_test.py --mode robot-battery --robot-id robot_01
```

### 3.4 Robot state telemetry simulation

```bash
python mqtt_e2e_test.py --mode robot-state --robot-id robot_01
```

## 4) Listen all robot topics

```bash
python mqtt_e2e_test.py --mode listen --listen-topic /robots/+/+
```

## 5) Optional broker settings

```bash
python mqtt_e2e_test.py --mode robot-state --broker broker.emqx.io --port 1883 --robot-id robot_01
```
