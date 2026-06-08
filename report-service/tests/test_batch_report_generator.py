from app.reports.batch import BatchReportGenerator


class FakeReader:
    def load_batch_report(self, batch_id):
        assert batch_id == "batch-1"
        return {
            "batch": {"id": "batch-1", "name": "Smoke Batch"},
            "summary": {"total": 2, "passed": 1, "failed": 1, "passRate": 0.5},
            "models": [{"modelId": "model-1", "runs": 2, "passed": 1, "passRate": 0.5}],
            "tasks": [{"taskId": "task-1", "runs": 2, "passed": 1, "passRate": 0.5}],
        }


class FakeArtifactClient:
    def __init__(self):
        self.saved = []

    def save_bytes(self, scope, artifact_type, filename, content, metadata, content_type):
        artifact = {
            "id": f"artifact-{len(self.saved) + 1}",
            "scope": scope,
            "artifactType": artifact_type,
            "objectKey": f"{scope}/{filename}",
            "metadata": metadata,
        }
        self.saved.append((scope, artifact_type, filename, content, metadata, content_type, artifact))
        return artifact


class FakeRepository:
    def __init__(self):
        self.completed = []

    def mark_completed(self, job_id, artifact_id):
        self.completed.append((job_id, artifact_id))
        return {"id": job_id, "status": "completed", "generatedArtifactId": artifact_id}


class FakeEvents:
    def __init__(self):
        self.events = []

    def publish_batch_event(self, event_type, batch_id, payload):
        self.events.append((event_type, batch_id, payload))


def test_batch_report_generator_writes_json_csv_xlsx_and_publishes_ready_event():
    artifact_client = FakeArtifactClient()
    repository = FakeRepository()
    events = FakeEvents()
    generator = BatchReportGenerator(
        reader=FakeReader(),
        artifact_client=artifact_client,
        repository=repository,
        event_publisher=events,
    )

    job = {
        "id": "report-1",
        "scopeId": "batch-1",
        "requestedBy": "user-1",
        "format": "json",
    }
    completed = generator.generate(job)

    filenames = [item[2] for item in artifact_client.saved]
    assert filenames == ["batch_report.json", "batch_report.csv", "batch_report.xlsx"]
    assert artifact_client.saved[0][5] == "application/json"
    assert artifact_client.saved[1][5] == "text/csv"
    assert artifact_client.saved[2][5] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert repository.completed == [("report-1", "artifact-1")]
    assert events.events == [
        (
            "report.ready",
            "batch-1",
            {"reportId": "report-1", "artifactId": "artifact-1", "status": "completed"},
        )
    ]
    assert completed["generatedArtifactId"] == "artifact-1"
