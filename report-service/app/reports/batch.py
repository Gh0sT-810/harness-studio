from io import BytesIO, StringIO
import csv
import json

from openpyxl import Workbook

from app.artifacts import ArtifactClient
from app.events import RedisEventPublisher
from app.repository import ReportJobRepository
from app.reports.reader import BatchReportReader
from app.settings import get_settings


class BatchReportGenerator:
    def __init__(self, reader=None, artifact_client=None, repository=None, event_publisher=None):
        settings = get_settings()
        self.reader = reader or BatchReportReader()
        self.artifact_client = artifact_client or ArtifactClient(settings.artifact_service_base_url, settings.artifact_service_timeout_seconds)
        self.repository = repository or ReportJobRepository()
        self.event_publisher = event_publisher or RedisEventPublisher()

    def generate(self, job: dict) -> dict:
        batch_id = job["scopeId"]
        report = self.reader.load_batch_report(batch_id)
        scope = f"reports/{job['id']}"
        metadata = {"batchId": batch_id, "reportJobId": job["id"], "requestedBy": job.get("requestedBy", "")}
        json_artifact = self.artifact_client.save_bytes(
            scope,
            "report",
            "batch_report.json",
            json.dumps(report, sort_keys=True).encode(),
            {**metadata, "filename": "batch_report.json", "contentType": "application/json"},
            "application/json",
        )
        self.artifact_client.save_bytes(
            scope,
            "report",
            "batch_report.csv",
            self._csv_bytes(report),
            {**metadata, "filename": "batch_report.csv", "contentType": "text/csv"},
            "text/csv",
        )
        self.artifact_client.save_bytes(
            scope,
            "report",
            "batch_report.xlsx",
            self._xlsx_bytes(report),
            {**metadata, "filename": "batch_report.xlsx", "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        completed = self.repository.mark_completed(job["id"], json_artifact["id"])
        self.event_publisher.publish_batch_event(
            "report.ready",
            batch_id,
            {"reportId": job["id"], "artifactId": json_artifact["id"], "status": "completed"},
        )
        return completed

    def _csv_bytes(self, report: dict) -> bytes:
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["section", "key", "value"])
        for key, value in report["summary"].items():
            writer.writerow(["summary", key, value])
        for model in report.get("models", []):
            writer.writerow(["model", model.get("modelId", ""), model.get("passRate", 0)])
        return output.getvalue().encode()

    def _xlsx_bytes(self, report: dict) -> bytes:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Summary"
        sheet.append(["Metric", "Value"])
        for key, value in report["summary"].items():
            sheet.append([key, value])
        models = workbook.create_sheet("Models")
        models.append(["Model", "Runs", "Passed", "Pass Rate"])
        for model in report.get("models", []):
            models.append([model.get("modelId", ""), model.get("runs", 0), model.get("passed", 0), model.get("passRate", 0)])
        buffer = BytesIO()
        workbook.save(buffer)
        return buffer.getvalue()
