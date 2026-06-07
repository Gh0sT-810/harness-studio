package services

import (
	"context"
	"testing"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeExecutionStore struct {
	batch      models.Batch
	cancelIDs  []string
	createReq  models.BatchCreateRequest
	createdBy  string
	snapshot   models.BatchSnapshot
	listResult []models.Batch
}

func (f *fakeExecutionStore) CreateBatch(_ context.Context, req models.BatchCreateRequest, createdBy string) (models.Batch, error) {
	f.createReq = req
	f.createdBy = createdBy
	return f.batch, nil
}

func (f *fakeExecutionStore) ListBatches(context.Context) ([]models.Batch, error) {
	return f.listResult, nil
}

func (f *fakeExecutionStore) GetBatchSnapshot(context.Context, string) (models.BatchSnapshot, error) {
	return f.snapshot, nil
}

func (f *fakeExecutionStore) ListCancelableIterationIDs(context.Context, string) ([]string, error) {
	return f.cancelIDs, nil
}

type fakeExecutionDispatcher struct {
	dispatchedBatch string
	cancelledIDs    []string
}

func (f *fakeExecutionDispatcher) DispatchBatch(_ context.Context, batchID string) error {
	f.dispatchedBatch = batchID
	return nil
}

func (f *fakeExecutionDispatcher) CancelIteration(_ context.Context, iterationID string) error {
	f.cancelledIDs = append(f.cancelledIDs, iterationID)
	return nil
}

func TestExecutionService_CreateBatchDispatchesCreatedBatch(t *testing.T) {
	store := &fakeExecutionStore{batch: models.Batch{ID: "batch-1", Status: "pending"}}
	dispatcher := &fakeExecutionDispatcher{}
	service := NewExecutionService(store, nil, dispatcher)

	batch, err := service.CreateBatch(context.Background(), models.BatchCreateRequest{Name: "Batch"}, "user-1")

	require.NoError(t, err)
	assert.Equal(t, "batch-1", batch.ID)
	assert.Equal(t, "batch-1", dispatcher.dispatchedBatch)
}

func TestExecutionService_CancelBatchCancelsEachCancelableIteration(t *testing.T) {
	store := &fakeExecutionStore{cancelIDs: []string{"iteration-1", "iteration-2"}}
	dispatcher := &fakeExecutionDispatcher{}
	service := NewExecutionService(store, nil, dispatcher)

	err := service.CancelBatch(context.Background(), "batch-1")

	require.NoError(t, err)
	assert.Equal(t, []string{"iteration-1", "iteration-2"}, dispatcher.cancelledIDs)
}
