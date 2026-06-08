package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
)

type ReportProxyError struct {
	StatusCode int
}

func (e ReportProxyError) Error() string {
	return fmt.Sprintf("report-service returned status %d", e.StatusCode)
}

type ReportProxyInterface interface {
	CreateReport(ctx context.Context, req models.ReportCreateRequest) (models.ReportJob, error)
	GetReport(ctx context.Context, reportID string) (models.ReportJob, error)
	GetBatchReport(ctx context.Context, batchID string) (models.ReportJob, error)
	RunReport(ctx context.Context, reportID string) (models.ReportJob, error)
}

type HTTPReportProxy struct {
	baseURL string
	client  *http.Client
}

func NewHTTPReportProxy(baseURL string, timeout time.Duration) ReportProxyInterface {
	return &HTTPReportProxy{baseURL: strings.TrimRight(baseURL, "/"), client: &http.Client{Timeout: timeout}}
}

func (p *HTTPReportProxy) CreateReport(ctx context.Context, payload models.ReportCreateRequest) (models.ReportJob, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return models.ReportJob{}, fmt.Errorf("marshal report request: %w", err)
	}
	return p.do(ctx, http.MethodPost, "/internal/reports", body)
}

func (p *HTTPReportProxy) GetReport(ctx context.Context, reportID string) (models.ReportJob, error) {
	return p.do(ctx, http.MethodGet, "/internal/reports/"+url.PathEscape(reportID), nil)
}

func (p *HTTPReportProxy) GetBatchReport(ctx context.Context, batchID string) (models.ReportJob, error) {
	return p.do(ctx, http.MethodGet, "/internal/batches/"+url.PathEscape(batchID)+"/report", nil)
}

func (p *HTTPReportProxy) RunReport(ctx context.Context, reportID string) (models.ReportJob, error) {
	return p.do(ctx, http.MethodPost, "/internal/reports/"+url.PathEscape(reportID)+"/run", nil)
}

func (p *HTTPReportProxy) do(ctx context.Context, method string, path string, body []byte) (models.ReportJob, error) {
	if p.baseURL == "" {
		return models.ReportJob{}, fmt.Errorf("report service base URL is not configured")
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, reader)
	if err != nil {
		return models.ReportJob{}, fmt.Errorf("build report-service request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return models.ReportJob{}, fmt.Errorf("call report-service: %w", err)
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return models.ReportJob{}, fmt.Errorf("read report-service response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return models.ReportJob{}, ReportProxyError{StatusCode: resp.StatusCode}
	}
	var report models.ReportJob
	if err := json.Unmarshal(responseBody, &report); err != nil {
		return models.ReportJob{}, fmt.Errorf("decode report-service response: %w", err)
	}
	return report, nil
}
