from datetime import UTC, datetime
import json
from uuid import uuid4

from app.settings import get_settings


def stream_key(batch_id: str) -> str:
    return f"batch:{batch_id}:events"


class RedisEventPublisher:
    def publish_batch_event(self, event_type: str, batch_id: str, payload: dict) -> str:
        from redis import Redis

        envelope = self._envelope(event_type, batch_id, payload)
        client = Redis.from_url(get_settings().redis_url)
        return client.xadd(stream_key(batch_id), self._redis_fields(envelope))

    def publish_iteration_event(self, event_type: str, iteration: dict, payload: dict) -> str:
        from redis import Redis

        batch_id = iteration["batch_id"]
        envelope = self._envelope(
            event_type,
            batch_id,
            payload,
            execution_id=iteration.get("execution_id", ""),
            iteration_id=iteration["id"],
        )
        client = Redis.from_url(get_settings().redis_url)
        return client.xadd(stream_key(batch_id), self._redis_fields(envelope))

    def _envelope(
        self,
        event_type: str,
        batch_id: str,
        payload: dict,
        execution_id: str = "",
        iteration_id: str = "",
    ) -> dict:
        envelope = {
            "version": "v1",
            "type": event_type,
            "id": f"{batch_id}:{uuid4()}",
            "batch_id": batch_id,
            "occurred_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "payload": payload,
        }
        if execution_id:
            envelope["execution_id"] = execution_id
        if iteration_id:
            envelope["iteration_id"] = iteration_id
        return envelope

    def _redis_fields(self, envelope: dict) -> dict:
        return {
            "event": json.dumps(envelope),
            "version": envelope["version"],
            "type": envelope["type"],
            "batch_id": envelope["batch_id"],
        }
