package repositories

import (
	"testing"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/stretchr/testify/assert"
)

func TestReportReadinessFromJobUsesLatestJobFields(t *testing.T) {
	created := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	completed := time.Date(2026, 1, 1, 0, 5, 0, 0, time.UTC)

	readiness := reportReadinessFromJob(models.ReportJob{
		ID:                  "report-1",
		Status:              "completed",
		GeneratedArtifactID: "artifact-1",
		Error:               "",
		CreatedAt:           created.Format(time.RFC3339),
		CompletedAt:         completed.Format(time.RFC3339),
	})

	assert.Equal(t, "completed", readiness.Status)
	assert.Equal(t, "report-1", readiness.ReportJobID)
	assert.Equal(t, "artifact-1", readiness.ArtifactID)
	assert.Equal(t, created.Format(time.RFC3339), readiness.RequestedAt)
	assert.Equal(t, completed.Format(time.RFC3339), readiness.CompletedAt)
}

func TestDefaultReportReadinessIsNotConfigured(t *testing.T) {
	assert.Equal(t, models.ReportReadiness{Status: "not_configured"}, defaultReportReadiness())
}
