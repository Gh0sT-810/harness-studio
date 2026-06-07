package events

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewEnvelope(t *testing.T) {
	event := NewEnvelope(TypeBatchCreated, "batch-1", map[string]any{"status": "pending"})

	assert.Equal(t, EnvelopeVersion, event.Version)
	assert.Equal(t, TypeBatchCreated, event.Type)
	assert.Equal(t, "batch-1", event.BatchID)
	assert.NotEmpty(t, event.ID)
	assert.Equal(t, "pending", event.Payload["status"])
}

func TestStreamKey(t *testing.T) {
	assert.Equal(t, "batch:batch-1:events", StreamKey("batch-1"))
}
