from app.tasks.maintenance import recover_leases


class FakeRepository:
    def __init__(self):
        self.recovered = [
            {"id": "iteration-1", "execution_id": "execution-1", "batch_id": "batch-1", "status": "retrying"},
            {"id": "iteration-2", "execution_id": "execution-2", "batch_id": "batch-1", "status": "crashed"},
        ]
        self.enqueued = []

    def recover_expired_leases(self, max_attempts):
        assert max_attempts == 2
        return self.recovered

    def mark_enqueued(self, iteration_id, celery_task_id):
        self.enqueued.append((iteration_id, celery_task_id))


class FakePublisher:
    def __init__(self):
        self.enqueued = []

    def enqueue_iteration(self, iteration_id):
        self.enqueued.append(iteration_id)
        return f"celery-{iteration_id}"


class FakeEvents:
    def __init__(self):
        self.events = []

    def publish_iteration_event(self, event_type, iteration, payload):
        self.events.append((event_type, iteration["id"], payload))


def test_recover_leases_publishes_expiry_and_reenqueues_retryable_iterations():
    repository = FakeRepository()
    publisher = FakePublisher()
    events = FakeEvents()

    result = recover_leases(
        repository=repository,
        task_publisher=publisher,
        event_publisher=events,
        max_attempts=2,
    )

    assert result == {"recovered": 2, "reenqueued": 1}
    assert events.events == [
        ("iteration.lease_expired", "iteration-1", {"status": "retrying"}),
        ("iteration.lease_expired", "iteration-2", {"status": "crashed"}),
    ]
    assert publisher.enqueued == ["iteration-1"]
    assert repository.enqueued == [("iteration-1", "celery-iteration-1")]
