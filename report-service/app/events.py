from datetime import UTC, datetime
import json
from uuid import uuid4

from app.settings import get_settings


def stream_key(batch_id: str) -> str:
    return f"batch:{batch_id}:events"


class RedisEventPublisher:
    def publish_batch_event(self, event_type: str, batch_id: str, payload: dict) -> str:
        from redis import Redis

        envelope = {
            "version": "v1",
            "type": event_type,
            "id": f"{batch_id}:{uuid4()}",
            "batch_id": batch_id,
            "occurred_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "payload": payload,
        }
        client = Redis.from_url(get_settings().redis_url)
        return client.xadd(stream_key(batch_id), {"event": json.dumps(envelope), "version": "v1", "type": event_type, "batch_id": batch_id})
