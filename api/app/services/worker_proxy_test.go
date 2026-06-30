package services

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWorkerProxyGetStatusDecodes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/workers", r.URL.Path)
		_, _ = w.Write([]byte(`{"desired":3,"actual":2,"total":2,"flowerAvailable":true,"workers":[{"id":"w1","name":"w1","state":"running","activity":"idle"}]}`))
	}))
	defer server.Close()

	status, err := NewHTTPWorkerProxy(server.URL, time.Second).GetWorkerStatus(context.Background())

	require.NoError(t, err)
	assert.Equal(t, 2, status.Actual)
	require.Len(t, status.Workers, 1)
	assert.Equal(t, "idle", status.Workers[0].Activity)
}

func TestWorkerProxyMapsNon2xxToTypedError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer server.Close()

	_, err := NewHTTPWorkerProxy(server.URL, time.Second).GetWorkerStatus(context.Background())

	var proxyErr WorkerProxyError
	require.True(t, errors.As(err, &proxyErr))
	assert.Equal(t, http.StatusBadGateway, proxyErr.StatusCode)
}

func TestWorkerProxyScalePostsReplicasAndTrimsSlash(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
		_, _ = w.Write([]byte(`{"desired":5,"actual":5,"changed":{}}`))
	}))
	defer server.Close()

	result, err := NewHTTPWorkerProxy(server.URL+"/", time.Second).Scale(context.Background(), 5)

	require.NoError(t, err)
	assert.Equal(t, "/internal/scale", gotPath)
	assert.Equal(t, float64(5), gotBody["replicas"])
	assert.Equal(t, float64(5), result["actual"])
}

func TestWorkerProxyTransportErrorIsNotTyped(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := server.URL
	server.Close() // closed -> connection refused

	_, err := NewHTTPWorkerProxy(url, time.Second).GetWorkerStatus(context.Background())

	require.Error(t, err)
	var proxyErr WorkerProxyError
	assert.False(t, errors.As(err, &proxyErr))
}

func TestWorkerProxyEmptyBaseURLIsRejected(t *testing.T) {
	_, err := NewHTTPWorkerProxy("", time.Second).GetWorkerStatus(context.Background())
	require.Error(t, err)
}

func TestWorkerProxyRestartEscapesContainerID(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		_, _ = w.Write([]byte(`{"id":"c 1","action":"restart"}`))
	}))
	defer server.Close()

	_, err := NewHTTPWorkerProxy(server.URL, time.Second).RestartWorker(context.Background(), "c 1")

	require.NoError(t, err)
	assert.Equal(t, "/internal/workers/c%201/restart", gotPath)
}
