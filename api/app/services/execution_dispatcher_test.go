package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHTTPExecutionDispatcher_DispatchBatch(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		assert.Equal(t, http.MethodPost, r.Method)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	dispatcher := NewHTTPExecutionDispatcher(server.URL, time.Second)

	err := dispatcher.DispatchBatch(context.Background(), "batch-1")

	require.NoError(t, err)
	assert.Equal(t, "/internal/batches/batch-1/dispatch", gotPath)
}

func TestHTTPExecutionDispatcher_CancelIteration(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		assert.Equal(t, http.MethodPost, r.Method)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	dispatcher := NewHTTPExecutionDispatcher(server.URL, time.Second)

	err := dispatcher.CancelIteration(context.Background(), "iteration-1")

	require.NoError(t, err)
	assert.Equal(t, "/internal/iterations/iteration-1/cancel", gotPath)
}

func TestHTTPExecutionDispatcher_ReturnsErrorForNonAcceptedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	dispatcher := NewHTTPExecutionDispatcher(server.URL, time.Second)

	err := dispatcher.DispatchBatch(context.Background(), "batch-1")

	assert.Error(t, err)
}
