package services

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type ExecutionDispatcherInterface interface {
	DispatchBatch(ctx context.Context, batchID string) error
	CancelIteration(ctx context.Context, iterationID string) error
}

type HTTPExecutionDispatcher struct {
	baseURL string
	client  *http.Client
}

func NewHTTPExecutionDispatcher(baseURL string, timeout time.Duration) ExecutionDispatcherInterface {
	return &HTTPExecutionDispatcher{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: timeout},
	}
}

func (d *HTTPExecutionDispatcher) DispatchBatch(ctx context.Context, batchID string) error {
	return d.post(ctx, fmt.Sprintf("/internal/batches/%s/dispatch", batchID))
}

func (d *HTTPExecutionDispatcher) CancelIteration(ctx context.Context, iterationID string) error {
	return d.post(ctx, fmt.Sprintf("/internal/iterations/%s/cancel", iterationID))
}

func (d *HTTPExecutionDispatcher) post(ctx context.Context, path string) error {
	if d.baseURL == "" {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("build execution-api request: %w", err)
	}
	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("call execution-api: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("execution-api returned status %d", resp.StatusCode)
	}
	return nil
}
