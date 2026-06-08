package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReportProxyCreatesAndRunsReport(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/internal/reports" {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":"report-1","status":"pending"}`))
			return
		}
		assert.Equal(t, "/internal/reports/report-1/run", r.URL.Path)
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"id":"report-1","status":"completed","generatedArtifactId":"artifact-1"}`))
	}))
	defer server.Close()

	proxy := NewHTTPReportProxy(server.URL, time.Second)
	created, err := proxy.CreateReport(context.Background(), models.ReportCreateRequest{JobType: "batch_report", ScopeType: "batch", ScopeID: "b1", Format: "json"})
	require.NoError(t, err)
	completed, err := proxy.RunReport(context.Background(), created.ID)

	require.NoError(t, err)
	assert.Equal(t, []string{"/internal/reports", "/internal/reports/report-1/run"}, paths)
	assert.Equal(t, "artifact-1", completed.GeneratedArtifactID)
}

func TestReportProxyGetsReport(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/reports/report-1", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"report-1","status":"completed"}`))
	}))
	defer server.Close()

	proxy := NewHTTPReportProxy(server.URL, time.Second)
	report, err := proxy.GetReport(context.Background(), "report-1")

	require.NoError(t, err)
	assert.Equal(t, "report-1", report.ID)
}
