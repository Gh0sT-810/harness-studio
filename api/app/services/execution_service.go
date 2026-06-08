package services

import (
	"context"

	"github.com/Gh0sT-810/harness-studio/api/app/events"
	"github.com/Gh0sT-810/harness-studio/api/app/models"
)

type ExecutionStore interface {
	CreateBatch(ctx context.Context, req models.BatchCreateRequest, createdBy string) (models.Batch, error)
	ListBatches(ctx context.Context) ([]models.Batch, error)
	GetBatchSnapshot(ctx context.Context, batchID string) (models.BatchSnapshot, error)
	ListCancelableIterationIDs(ctx context.Context, batchID string) ([]string, error)
	DefaultModelID(ctx context.Context) (string, error)
}

type ExecutionServiceInterface interface {
	CreateBatch(ctx context.Context, req models.BatchCreateRequest, createdBy string) (models.Batch, error)
	ListBatches(ctx context.Context) ([]models.Batch, error)
	GetBatchSnapshot(ctx context.Context, batchID string) (models.BatchSnapshot, error)
	CancelBatch(ctx context.Context, batchID string) error
}

type ExecutionService struct {
	store      ExecutionStore
	events     EventServiceInterface
	dispatcher ExecutionDispatcherInterface
}

func NewExecutionService(store ExecutionStore, eventService EventServiceInterface, dispatcher ExecutionDispatcherInterface) ExecutionServiceInterface {
	return &ExecutionService{store: store, events: eventService, dispatcher: dispatcher}
}

func (s *ExecutionService) CreateBatch(ctx context.Context, req models.BatchCreateRequest, createdBy string) (models.Batch, error) {
	if len(req.ModelIDs) == 0 {
		defaultModelID, err := s.store.DefaultModelID(ctx)
		if err != nil {
			return models.Batch{}, err
		}
		req.ModelIDs = []string{defaultModelID}
	}
	batch, err := s.store.CreateBatch(ctx, req, createdBy)
	if err != nil {
		return models.Batch{}, err
	}

	if s.events != nil {
		total := req.IterationCount * len(req.TaskIDs) * len(req.ModelIDs)
		if total < 0 {
			total = 0
		}
		_, _ = s.events.PublishBatchEvent(ctx, batch.ID, events.NewEnvelope(events.TypeBatchCreated, batch.ID, map[string]any{
			"batch": batch,
		}))
		_, _ = s.events.PublishBatchEvent(ctx, batch.ID, events.NewEnvelope(events.TypeUserAction, batch.ID, map[string]any{
			"action":  "batch.created",
			"user_id": createdBy,
		}))
		_, _ = s.events.PublishBatchEvent(ctx, batch.ID, events.NewEnvelope(events.TypeBatchSummaryUpdated, batch.ID, map[string]any{
			"counts": map[string]int{"pending": total, "total": total},
		}))
	}

	if s.dispatcher != nil {
		if err := s.dispatcher.DispatchBatch(ctx, batch.ID); err != nil && s.events != nil {
			_, _ = s.events.PublishBatchEvent(ctx, batch.ID, events.NewEnvelope(events.TypeSnapshotRequired, batch.ID, map[string]any{
				"reason": "dispatch_failed",
				"error":  err.Error(),
			}))
		}
	}

	return batch, nil
}

func (s *ExecutionService) ListBatches(ctx context.Context) ([]models.Batch, error) {
	return s.store.ListBatches(ctx)
}

func (s *ExecutionService) GetBatchSnapshot(ctx context.Context, batchID string) (models.BatchSnapshot, error) {
	return s.store.GetBatchSnapshot(ctx, batchID)
}

func (s *ExecutionService) CancelBatch(ctx context.Context, batchID string) error {
	iterationIDs, err := s.store.ListCancelableIterationIDs(ctx, batchID)
	if err != nil {
		return err
	}
	if s.dispatcher == nil {
		return nil
	}
	for _, iterationID := range iterationIDs {
		if err := s.dispatcher.CancelIteration(ctx, iterationID); err != nil {
			return err
		}
	}
	return nil
}
