package services

import (
	"context"

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
	store ExecutionStore
}

func NewExecutionService(store ExecutionStore) ExecutionServiceInterface {
	return &ExecutionService{store: store}
}

func (s *ExecutionService) CreateBatch(ctx context.Context, req models.BatchCreateRequest, createdBy string) (models.Batch, error) {
	return s.store.CreateBatch(ctx, req, createdBy)
}

func (s *ExecutionService) ListBatches(ctx context.Context) ([]models.Batch, error) {
	return s.store.ListBatches(ctx)
}

func (s *ExecutionService) GetBatchSnapshot(ctx context.Context, batchID string) (models.BatchSnapshot, error) {
	return s.store.GetBatchSnapshot(ctx, batchID)
}
