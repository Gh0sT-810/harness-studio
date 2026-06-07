package services

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type ArtifactProxyError struct {
	StatusCode int
}

func (e ArtifactProxyError) Error() string {
	return fmt.Sprintf("artifact-service returned status %d", e.StatusCode)
}

type ArtifactProxyInterface interface {
	ListScope(ctx context.Context, scope string) ([]byte, string, error)
	GetArtifact(ctx context.Context, artifactID string) ([]byte, string, error)
	GetArtifactMetadata(ctx context.Context, artifactID string) ([]byte, string, error)
	ArchiveScope(ctx context.Context, scope string) ([]byte, string, error)
	ArchiveBatch(ctx context.Context, batchID string) ([]byte, string, error)
}

type HTTPArtifactProxy struct {
	baseURL string
	client  *http.Client
}

func NewHTTPArtifactProxy(baseURL string, timeout time.Duration) ArtifactProxyInterface {
	return &HTTPArtifactProxy{baseURL: strings.TrimRight(baseURL, "/"), client: &http.Client{Timeout: timeout}}
}

func (p *HTTPArtifactProxy) ListScope(ctx context.Context, scope string) ([]byte, string, error) {
	return p.get(ctx, "/internal/artifacts?scope="+url.QueryEscape(scope))
}

func (p *HTTPArtifactProxy) GetArtifact(ctx context.Context, artifactID string) ([]byte, string, error) {
	return p.get(ctx, "/internal/artifacts/"+url.PathEscape(artifactID))
}

func (p *HTTPArtifactProxy) GetArtifactMetadata(ctx context.Context, artifactID string) ([]byte, string, error) {
	return p.get(ctx, "/internal/artifacts/"+url.PathEscape(artifactID)+"/metadata")
}

func (p *HTTPArtifactProxy) ArchiveScope(ctx context.Context, scope string) ([]byte, string, error) {
	escaped := strings.ReplaceAll(url.PathEscape(scope), "%2F", "/")
	return p.get(ctx, "/internal/scopes/"+escaped+"/archive")
}

func (p *HTTPArtifactProxy) ArchiveBatch(ctx context.Context, batchID string) ([]byte, string, error) {
	return p.get(ctx, "/internal/batches/"+url.PathEscape(batchID)+"/archive")
}

func (p *HTTPArtifactProxy) get(ctx context.Context, path string) ([]byte, string, error) {
	if p.baseURL == "" {
		return nil, "", fmt.Errorf("artifact service base URL is not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+path, nil)
	if err != nil {
		return nil, "", fmt.Errorf("build artifact-service request: %w", err)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("call artifact-service: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("read artifact-service response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, "", ArtifactProxyError{StatusCode: resp.StatusCode}
	}
	return body, resp.Header.Get("Content-Type"), nil
}
