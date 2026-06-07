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
}

type ExecutionServiceInterface interface {
	CreateBatch(ctx context.Context, req models.BatchCreateRequest, createdBy string) (models.Batch, error)
	ListBatches(ctx context.Context) ([]models.Batch, error)
	GetBatchSnapshot(ctx context.Context, batchID string) (models.BatchSnapshot, error)
}

type ExecutionService struct {
	store  ExecutionStore
	events EventServiceInterface
}

func NewExecutionService(store ExecutionStore, eventService EventServiceInterface) ExecutionServiceInterface {
	return &ExecutionService{store: store, events: eventService}
}

func (s *ExecutionService) CreateBatch(ctx context.Context, req models.BatchCreateRequest, createdBy string) (models.Batch, error) {
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

	return batch, nil
}

func (s *ExecutionService) ListBatches(ctx context.Context) ([]models.Batch, error) {
	return s.store.ListBatches(ctx)
}

func (s *ExecutionService) GetBatchSnapshot(ctx context.Context, batchID string) (models.BatchSnapshot, error) {
	return s.store.GetBatchSnapshot(ctx, batchID)
}
