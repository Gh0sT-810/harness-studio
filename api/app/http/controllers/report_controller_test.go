package controllers

import (
	"context"
	"net/http"
	"testing"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type mockReportProxy struct {
	created models.ReportJob
	report  models.ReportJob
	err     error
}

func (m mockReportProxy) CreateReport(context.Context, models.ReportCreateRequest) (models.ReportJob, error) {
	return m.created, m.err
}

func (m mockReportProxy) GetReport(context.Context, string) (models.ReportJob, error) {
	return m.report, m.err
}

func (m mockReportProxy) GetBatchReport(context.Context, string) (models.ReportJob, error) {
	return m.report, m.err
}

func (m mockReportProxy) RunReport(context.Context, string) (models.ReportJob, error) {
	return m.report, m.err
}

func setupReportRouter(proxy mockReportProxy) *gin.Engine {
	router := gin.New()
	controller := NewReportController(proxy)
	router.POST("/reports", controller.CreateReport)
	router.GET("/reports/:id", controller.GetReport)
	router.POST("/batches/:id/report", controller.CreateBatchReport)
	router.GET("/batches/:id/report", controller.GetBatchReport)
	return router
}

func TestReportControllerCreatesReport(t *testing.T) {
	router := setupReportRouter(mockReportProxy{created: models.ReportJob{ID: "report-1", Status: "pending"}})

	w := performRequest(router, http.MethodPost, "/reports", map[string]any{"scopeId": "batch-1", "scopeType": "batch", "jobType": "batch_report", "format": "json"})

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Body.String(), "report-1")
}

func TestReportControllerCreatesAndRunsBatchReport(t *testing.T) {
	router := setupReportRouter(mockReportProxy{
		created: models.ReportJob{ID: "report-1", Status: "pending"},
		report:  models.ReportJob{ID: "report-1", Status: "completed", GeneratedArtifactID: "artifact-1"},
	})

	w := performRequest(router, http.MethodPost, "/batches/batch-1/report", nil)

	assert.Equal(t, http.StatusAccepted, w.Code)
	assert.Contains(t, w.Body.String(), "artifact-1")
}

func TestReportControllerGetsBatchReport(t *testing.T) {
	router := setupReportRouter(mockReportProxy{report: models.ReportJob{ID: "report-1", Status: "completed"}})

	w := performRequest(router, http.MethodGet, "/batches/batch-1/report", nil)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "report-1")
}
