import time


def publish_with_retry(client, topic: str, payload: str, qos: int = 1, retries: int = 3) -> bool:
    delay = 0.3
    for attempt in range(retries):
        result = client.publish(topic, payload, qos=qos)
        if result[0] == 0:
            return True
        if attempt < retries - 1:
            time.sleep(delay)
            delay *= 2
    return False
