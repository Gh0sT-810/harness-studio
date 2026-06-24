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

// ArtifactDownload carries a binary artifact body together with the response
// headers the browser needs to trigger a real file download: the upstream
// Content-Type and the artifact-service Content-Disposition (which holds the
// original filename). These are kept together so the proxy hop does not drop
// the attachment hint set by artifact-service.
type ArtifactDownload struct {
	Body               []byte
	ContentType        string
	ContentDisposition string
}

type ArtifactProxyInterface interface {
	ListScope(ctx context.Context, scope string) ([]byte, string, error)
	GetArtifact(ctx context.Context, artifactID string) (ArtifactDownload, error)
	GetArtifactMetadata(ctx context.Context, artifactID string) ([]byte, string, error)
	ArchiveScope(ctx context.Context, scope string) (ArtifactDownload, error)
	ArchiveBatch(ctx context.Context, batchID string) (ArtifactDownload, error)
}

type HTTPArtifactProxy struct {
	baseURL string
	client  *http.Client
}

func NewHTTPArtifactProxy(baseURL string, timeout time.Duration) ArtifactProxyInterface {
	return &HTTPArtifactProxy{baseURL: strings.TrimRight(baseURL, "/"), client: &http.Client{Timeout: timeout}}
}

func (p *HTTPArtifactProxy) ListScope(ctx context.Context, scope string) ([]byte, string, error) {
	body, contentType, _, err := p.get(ctx, "/internal/artifacts?scope="+url.QueryEscape(scope))
	return body, contentType, err
}

func (p *HTTPArtifactProxy) GetArtifact(ctx context.Context, artifactID string) (ArtifactDownload, error) {
	return p.download(ctx, "/internal/artifacts/"+url.PathEscape(artifactID))
}

func (p *HTTPArtifactProxy) GetArtifactMetadata(ctx context.Context, artifactID string) ([]byte, string, error) {
	body, contentType, _, err := p.get(ctx, "/internal/artifacts/"+url.PathEscape(artifactID)+"/metadata")
	return body, contentType, err
}

func (p *HTTPArtifactProxy) ArchiveScope(ctx context.Context, scope string) (ArtifactDownload, error) {
	escaped := strings.ReplaceAll(url.PathEscape(scope), "%2F", "/")
	return p.download(ctx, "/internal/scopes/"+escaped+"/archive")
}

func (p *HTTPArtifactProxy) ArchiveBatch(ctx context.Context, batchID string) (ArtifactDownload, error) {
	return p.download(ctx, "/internal/batches/"+url.PathEscape(batchID)+"/archive")
}

func (p *HTTPArtifactProxy) download(ctx context.Context, path string) (ArtifactDownload, error) {
	body, contentType, contentDisposition, err := p.get(ctx, path)
	if err != nil {
		return ArtifactDownload{}, err
	}
	return ArtifactDownload{Body: body, ContentType: contentType, ContentDisposition: contentDisposition}, nil
}

func (p *HTTPArtifactProxy) get(ctx context.Context, path string) ([]byte, string, string, error) {
	if p.baseURL == "" {
		return nil, "", "", fmt.Errorf("artifact service base URL is not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+path, nil)
	if err != nil {
		return nil, "", "", fmt.Errorf("build artifact-service request: %w", err)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, "", "", fmt.Errorf("call artifact-service: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", "", fmt.Errorf("read artifact-service response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, "", "", ArtifactProxyError{StatusCode: resp.StatusCode}
	}
	return body, resp.Header.Get("Content-Type"), resp.Header.Get("Content-Disposition"), nil
}
