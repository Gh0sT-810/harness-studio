from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.repository import ReportJobRepository
from app.reports.batch import BatchReportGenerator

router = APIRouter(prefix="/internal", tags=["internal"])


class ReportCreateRequest(BaseModel):
    job_type: str = Field(default="batch_report", alias="jobType")
    scope_type: str = Field(default="batch", alias="scopeType")
    scope_id: str = Field(alias="scopeId")
    output_format: str = Field(default="json", alias="format")
    payload: dict[str, Any] = Field(default_factory=dict)
    requested_by: str = Field(default="", alias="requestedBy")

    model_config = {"populate_by_name": True}


def get_repository() -> ReportJobRepository:
    return ReportJobRepository()


def get_generator() -> BatchReportGenerator:
    return BatchReportGenerator()


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(request: ReportCreateRequest, repository: ReportJobRepository = Depends(get_repository)) -> dict:
    return repository.create(
        job_type=request.job_type,
        scope_type=request.scope_type,
        scope_id=request.scope_id,
        output_format=request.output_format,
        payload=request.payload,
        requested_by=request.requested_by,
    )


@router.get("/reports/{report_id}")
def get_report(report_id: str, repository: ReportJobRepository = Depends(get_repository)) -> dict:
    try:
        return repository.get(report_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="report job not found") from exc


@router.get("/batches/{batch_id}/report")
def get_latest_batch_report(batch_id: str, repository: ReportJobRepository = Depends(get_repository)) -> dict:
    try:
        return repository.latest_by_scope("batch", batch_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="report job not found") from exc


@router.post("/reports/{report_id}/run", status_code=status.HTTP_202_ACCEPTED)
def run_report(
    report_id: str,
    repository: ReportJobRepository = Depends(get_repository),
    generator: BatchReportGenerator = Depends(get_generator),
) -> dict:
    try:
        job = repository.mark_running(report_id)
        return generator.generate(job)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="report job not found") from exc
    except Exception as exc:
        failed = repository.mark_failed(report_id, str(exc))
        return failed
