from fastapi.testclient import TestClient

from app.main import app
from app.routes.internal import get_event_publisher, get_iteration_repository, get_task_publisher


class FakeRepository:
    def __init__(self):
        self.pending = [
            {"id": "iteration-1", "batch_id": "batch-1"},
            {"id": "iteration-2", "batch_id": "batch-1"},
        ]
        self.stamped = []
        self.cancelled = []

    def list_dispatchable_iterations(self, batch_id):
        assert batch_id == "batch-1"
        return self.pending

    def get_iteration(self, iteration_id):
        return {"id": iteration_id, "batch_id": "batch-1"}

    def mark_enqueued(self, iteration_id, celery_task_id):
        self.stamped.append((iteration_id, celery_task_id))

    def mark_cancelled(self, iteration_id):
        self.cancelled.append(iteration_id)
        return {"id": iteration_id, "status": "cancelled"}


class FakePublisher:
    def __init__(self):
        self.enqueued = []

    def enqueue_iteration(self, iteration_id):
        celery_task_id = f"celery-{iteration_id}"
        self.enqueued.append(iteration_id)
        return celery_task_id


class FakeEventPublisher:
    def __init__(self):
        self.events = []

    def publish_iteration_event(self, event_type, iteration, payload):
        self.events.append((event_type, iteration["id"], payload))


def test_dispatch_batch_enqueues_each_dispatchable_iteration():
    repository = FakeRepository()
    publisher = FakePublisher()
    events = FakeEventPublisher()
    app.dependency_overrides[get_iteration_repository] = lambda: repository
    app.dependency_overrides[get_task_publisher] = lambda: publisher
    app.dependency_overrides[get_event_publisher] = lambda: events

    try:
        response = TestClient(app).post("/internal/batches/batch-1/dispatch")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {
        "batch_id": "batch-1",
        "enqueued": [
            {"iteration_id": "iteration-1", "celery_task_id": "celery-iteration-1"},
            {"iteration_id": "iteration-2", "celery_task_id": "celery-iteration-2"},
        ],
    }
    assert publisher.enqueued == ["iteration-1", "iteration-2"]
    assert repository.stamped == [
        ("iteration-1", "celery-iteration-1"),
        ("iteration-2", "celery-iteration-2"),
    ]
    assert events.events == [
        ("iteration.enqueued", "iteration-1", {"status": "pending", "sub_status": "queued"}),
        ("iteration.enqueued", "iteration-2", {"status": "pending", "sub_status": "queued"}),
    ]


def test_cancel_iteration_marks_iteration_cancelled_without_enqueuing():
    repository = FakeRepository()
    publisher = FakePublisher()
    events = FakeEventPublisher()
    app.dependency_overrides[get_iteration_repository] = lambda: repository
    app.dependency_overrides[get_task_publisher] = lambda: publisher
    app.dependency_overrides[get_event_publisher] = lambda: events

    try:
        response = TestClient(app).post("/internal/iterations/iteration-1/cancel")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {"id": "iteration-1", "status": "cancelled"}
    assert repository.cancelled == ["iteration-1"]
    assert publisher.enqueued == []
    assert events.events == [
        ("iteration.cancelled", "iteration-1", {"status": "cancelled"}),
    ]
