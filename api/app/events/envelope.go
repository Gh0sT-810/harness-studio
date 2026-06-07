package events

import (
	"fmt"
	"time"
)

const (
	EnvelopeVersion = "v1"

	TypeBatchCreated        = "batch.created"
	TypeBatchSummaryUpdated = "batch.summary_updated"
	TypeUserAction          = "user.action"
	TypeSnapshotRequired    = "snapshot.required"
	TypeIterationEnqueued   = "iteration.enqueued"
	TypeIterationStarted    = "iteration.started"
	TypeIterationStepAdded  = "iteration.step_added"
	TypeArtifactCreated     = "artifact.created"
	TypeIterationCompleted  = "iteration.completed"
	TypeIterationCancelled  = "iteration.cancelled"
	TypeExecutionUpdated    = "execution.updated"
	TypeReportReady         = "report.ready"
	TypeLeaseExpired        = "iteration.lease_expired"
)

type Envelope struct {
	Version     string         `json:"version"`
	Type        string         `json:"type"`
	ID          string         `json:"id"`
	BatchID     string         `json:"batch_id"`
	ExecutionID string         `json:"execution_id,omitempty"`
	IterationID string         `json:"iteration_id,omitempty"`
	OccurredAt  time.Time      `json:"occurred_at"`
	Sequence    string         `json:"sequence,omitempty"`
	Payload     map[string]any `json:"payload"`
}

type StreamEvent struct {
	StreamID string
	Envelope Envelope
}

func NewEnvelope(eventType, batchID string, payload map[string]any) Envelope {
	now := time.Now().UTC()
	return Envelope{
		Version:    EnvelopeVersion,
		Type:       eventType,
		ID:         fmt.Sprintf("%s:%d", batchID, now.UnixNano()),
		BatchID:    batchID,
		OccurredAt: now,
		Payload:    payload,
	}
}

func StreamKey(batchID string) string {
	return fmt.Sprintf("batch:%s:events", batchID)
}
