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

type WorkerProxyError struct {
	StatusCode int
}

func (e WorkerProxyError) Error() string {
	return fmt.Sprintf("worker-scaler returned status %d", e.StatusCode)
}

type WorkerProxyInterface interface {
	GetWorkerStatus(ctx context.Context) (models.WorkerStatus, error)
	Scale(ctx context.Context, replicas int) (map[string]any, error)
	StopIdle(ctx context.Context, count *int) (map[string]any, error)
	RestartWorker(ctx context.Context, containerID string) (map[string]any, error)
}

type HTTPWorkerProxy struct {
	baseURL string
	client  *http.Client
}

func NewHTTPWorkerProxy(baseURL string, timeout time.Duration) WorkerProxyInterface {
	return &HTTPWorkerProxy{baseURL: strings.TrimRight(baseURL, "/"), client: &http.Client{Timeout: timeout}}
}

func (p *HTTPWorkerProxy) GetWorkerStatus(ctx context.Context) (models.WorkerStatus, error) {
	body, err := p.do(ctx, http.MethodGet, "/internal/workers", nil)
	if err != nil {
		return models.WorkerStatus{}, err
	}
	var status models.WorkerStatus
	if err := json.Unmarshal(body, &status); err != nil {
		return models.WorkerStatus{}, fmt.Errorf("decode worker-scaler status: %w", err)
	}
	return status, nil
}

func (p *HTTPWorkerProxy) Scale(ctx context.Context, replicas int) (map[string]any, error) {
	body, err := json.Marshal(map[string]int{"replicas": replicas})
	if err != nil {
		return nil, fmt.Errorf("marshal scale request: %w", err)
	}
	return p.doMap(ctx, http.MethodPost, "/internal/scale", body)
}

func (p *HTTPWorkerProxy) StopIdle(ctx context.Context, count *int) (map[string]any, error) {
	payload := map[string]any{}
	if count != nil {
		payload["count"] = *count
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal stop-idle request: %w", err)
	}
	return p.doMap(ctx, http.MethodPost, "/internal/workers/stop-idle", body)
}

func (p *HTTPWorkerProxy) RestartWorker(ctx context.Context, containerID string) (map[string]any, error) {
	return p.doMap(ctx, http.MethodPost, "/internal/workers/"+url.PathEscape(containerID)+"/restart", nil)
}

func (p *HTTPWorkerProxy) doMap(ctx context.Context, method, path string, body []byte) (map[string]any, error) {
	responseBody, err := p.do(ctx, method, path, body)
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	if len(responseBody) == 0 {
		return out, nil
	}
	if err := json.Unmarshal(responseBody, &out); err != nil {
		return nil, fmt.Errorf("decode worker-scaler response: %w", err)
	}
	return out, nil
}

func (p *HTTPWorkerProxy) do(ctx context.Context, method, path string, body []byte) ([]byte, error) {
	if p.baseURL == "" {
		return nil, fmt.Errorf("worker scaler base URL is not configured")
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, reader)
	if err != nil {
		return nil, fmt.Errorf("build worker-scaler request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call worker-scaler: %w", err)
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read worker-scaler response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, WorkerProxyError{StatusCode: resp.StatusCode}
	}
	return responseBody, nil
}
