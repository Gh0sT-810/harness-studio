import json

from app.artifacts import ArtifactClient
from app.events import RedisEventPublisher
from app.repository import ReportJobRepository
from app.reports.csv_export import build_csv_bytes
from app.reports.reader import BatchReportReader
from app.reports.snapshot import build_snapshot
from app.reports.summary import build_summary
from app.reports.workbook import build_workbook_bytes
from app.settings import get_settings

JSON_CONTENT_TYPE = "application/json"
CSV_CONTENT_TYPE = "text/csv"
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class BatchReportGenerator:
    def __init__(self, reader=None, artifact_client=None, repository=None, event_publisher=None):
        settings = get_settings()
        self.artifact_client = artifact_client or ArtifactClient(settings.artifact_service_base_url, settings.artifact_service_timeout_seconds)
        self.reader = reader or BatchReportReader(artifact_client=self.artifact_client)
        self.repository = repository or ReportJobRepository()
        self.event_publisher = event_publisher or RedisEventPublisher()
        self.frontend_base_url = settings.frontend_base_url

    def generate(self, job: dict) -> dict:
        batch_id = job["scopeId"]
        meta = self.reader.load_batch_meta(batch_id)
        records = self.reader.collect_records(batch_id)
        summary_rows, task_map = build_summary(records)
        snapshot = build_snapshot(summary_rows, records, task_map)

        scope = f"reports/{job['id']}"
        metadata = {"batchId": batch_id, "reportJobId": job["id"], "requestedBy": job.get("requestedBy", "")}

        json_bytes = json.dumps(snapshot, indent=2, default=str).encode()
        json_artifact = self.artifact_client.save_bytes(
            scope,
            "report",
            "batch_report.json",
            json_bytes,
            {**metadata, "filename": "batch_report.json", "contentType": JSON_CONTENT_TYPE},
            JSON_CONTENT_TYPE,
        )

        csv_bytes = build_csv_bytes(records)
        csv_artifact = self.artifact_client.save_bytes(
            scope,
            "report",
            "batch_report.csv",
            csv_bytes,
            {**metadata, "filename": "batch_report.csv", "contentType": CSV_CONTENT_TYPE},
            CSV_CONTENT_TYPE,
        )

        xlsx_bytes = build_workbook_bytes(
            summary_rows,
            records,
            task_map,
            total_iterations=meta.get("iteration_count"),
            frontend_base_url=self.frontend_base_url,
        )
        xlsx_artifact = self.artifact_client.save_bytes(
            scope,
            "report",
            "batch_report.xlsx",
            xlsx_bytes,
            {**metadata, "filename": "batch_report.xlsx", "contentType": XLSX_CONTENT_TYPE},
            XLSX_CONTENT_TYPE,
        )

        artifacts = {
            "json": {"id": json_artifact["id"], "filename": "batch_report.json", "contentType": JSON_CONTENT_TYPE},
            "csv": {"id": csv_artifact["id"], "filename": "batch_report.csv", "contentType": CSV_CONTENT_TYPE},
            "xlsx": {"id": xlsx_artifact["id"], "filename": "batch_report.xlsx", "contentType": XLSX_CONTENT_TYPE},
        }
        completed = self.repository.mark_completed(job["id"], json_artifact["id"], artifacts)
        self.event_publisher.publish_batch_event(
            "report.ready",
            batch_id,
            {"reportId": job["id"], "artifactId": json_artifact["id"], "status": "completed"},
        )
        return completed
