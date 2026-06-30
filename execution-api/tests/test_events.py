import json

import redis

from app import events
from app.events import RedisEventPublisher, stream_key


class FakeRedis:
    def __init__(self):
        self.adds = []

    def xadd(self, key, fields):
        self.adds.append((key, fields))
        return b"1-0"


def test_redis_client_is_reused_across_publishes(monkeypatch):
    # RED-01: Redis.from_url is called once and the client reused for every publish.
    monkeypatch.setattr(events, "_client", None)
    calls = {"n": 0}
    fake = FakeRedis()

    def fake_from_url(url):
        calls["n"] += 1
        return fake

    monkeypatch.setattr(redis.Redis, "from_url", staticmethod(fake_from_url))

    publisher = RedisEventPublisher()
    publisher.publish_batch_event("batch.summary_updated", "batch-1", {"counts": {}})
    publisher.publish_iteration_event(
        "iteration.started",
        {"id": "it-1", "batch_id": "batch-1", "execution_id": "ex-1"},
        {"status": "executing"},
    )

    assert calls["n"] == 1
    assert len(fake.adds) == 2


def test_publish_iteration_event_writes_envelope(monkeypatch):
    # RED-02: correct stream key + envelope fields (version/type/batch_id/exec/iter ids).
    monkeypatch.setattr(events, "_client", None)
    fake = FakeRedis()
    monkeypatch.setattr(redis.Redis, "from_url", staticmethod(lambda url: fake))

    RedisEventPublisher().publish_iteration_event(
        "iteration.started",
        {"id": "it-1", "batch_id": "batch-1", "execution_id": "ex-1"},
        {"status": "executing"},
    )

    key, fields = fake.adds[0]
    assert key == stream_key("batch-1") == "batch:batch-1:events"
    assert fields["version"] == "v1"
    assert fields["type"] == "iteration.started"
    assert fields["batch_id"] == "batch-1"
    envelope = json.loads(fields["event"])
    assert envelope["execution_id"] == "ex-1"
    assert envelope["iteration_id"] == "it-1"
