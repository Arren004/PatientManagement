
import random
import time

from paho.mqtt import client as mqtt_client


broker = 'broker.emqx.io'  # hoặc địa chỉ broker bạn dùng
port = 1883
# Generate a Client ID with the publish prefix.
client_id = f'publish-{random.randint(0, 1000)}'
# username = 'emqx'
# password = 'public'

_mqtt_health = {
    "connected": False,
    "last_rc": None,
    "last_error": "",
}


def get_mqtt_health():
    return {
        "broker": broker,
        "port": port,
        **_mqtt_health,
    }

def connect_mqtt():
    def on_connect(client, userdata, flags, rc):
        _mqtt_health["last_rc"] = rc
        if rc == 0:
            _mqtt_health["connected"] = True
            _mqtt_health["last_error"] = ""
            print("Connected to MQTT Broker!")
        else:
            _mqtt_health["connected"] = False
            _mqtt_health["last_error"] = f"connect failed rc={rc}"
            print("Failed to connect, return code %d\n", rc)

    def on_disconnect(client, userdata, rc):
        _mqtt_health["connected"] = False
        _mqtt_health["last_rc"] = rc
        if rc != 0:
            _mqtt_health["last_error"] = f"unexpected disconnect rc={rc}"

    def on_message(client, userdata, msg):
        print(f"[DEFAULT MQTT] Received `{repr(msg.payload.decode(errors='ignore'))}` on `{msg.topic}`")

    client = mqtt_client.Client(client_id=client_id)
    # client.username_pw_set(username, password)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.connect(broker, port)
   
    return client

