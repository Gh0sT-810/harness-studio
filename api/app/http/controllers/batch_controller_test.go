package controllers

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/events"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type failingBatchEventService struct{}

func (f failingBatchEventService) PublishBatchEvent(context.Context, string, events.Envelope) (string, error) {
	return "", nil
}

func (f failingBatchEventService) ReadBatchEvents(context.Context, string, string, time.Duration) ([]events.StreamEvent, error) {
	return nil, errors.New("redis unavailable")
}

func TestStreamBatchEventsEmitsSnapshotRequiredEnvelopeOnReadError(t *testing.T) {
	router := gin.New()
	controller := NewBatchController(nil, failingBatchEventService{})
	router.GET("/batches/:id/events", controller.StreamBatchEvents)

	w := performRequest(router, http.MethodGet, "/batches/batch-1/events", nil)

	require.Equal(t, http.StatusOK, w.Code)
	body := w.Body.String()
	assert.Contains(t, body, "event: snapshot.required")
	assert.Contains(t, body, `"type":"snapshot.required"`)
	assert.Contains(t, body, `"batch_id":"batch-1"`)
	assert.Contains(t, body, `"reason":"stream_error"`)
}
