package services

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestArtifactProxyListsIterationFiles(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.RequestURI()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"id":"a1","artifactType":"timeline"}]`))
	}))
	defer server.Close()

	proxy := NewHTTPArtifactProxy(server.URL, time.Second)
	body, contentType, err := proxy.ListScope(context.Background(), "iterations/i1")

	require.NoError(t, err)
	assert.Equal(t, "/internal/artifacts?scope=iterations%2Fi1", gotPath)
	assert.Equal(t, "application/json", contentType)
	assert.JSONEq(t, `[{"id":"a1","artifactType":"timeline"}]`, string(body))
}

func TestArtifactProxyDownloadsArtifact(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/artifacts/a1", r.URL.Path)
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("png"))
	}))
	defer server.Close()

	proxy := NewHTTPArtifactProxy(server.URL, time.Second)
	body, contentType, err := proxy.GetArtifact(context.Background(), "a1")

	require.NoError(t, err)
	assert.Equal(t, "image/png", contentType)
	assert.Equal(t, []byte("png"), body)
}

func TestArtifactProxyStreamsArchive(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/batches/b1/archive", r.URL.Path)
		w.Header().Set("Content-Type", "application/zip")
		_, _ = io.WriteString(w, "zip")
	}))
	defer server.Close()

	proxy := NewHTTPArtifactProxy(server.URL, time.Second)
	body, contentType, err := proxy.ArchiveBatch(context.Background(), "b1")

	require.NoError(t, err)
	assert.Equal(t, "application/zip", contentType)
	assert.Equal(t, []byte("zip"), body)
}
