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
	defaultID  string
	models     map[string]models.ModelDefinition
	providers  map[string]models.ModelProvider
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

func (f *fakeExecutionStore) GetBatchAnalytics(context.Context, string) (models.BatchAnalytics, error) {
	return models.BatchAnalytics{}, nil
}

func (f *fakeExecutionStore) ListCancelableIterationIDs(context.Context, string) ([]string, error) {
	return f.cancelIDs, nil
}

func (f *fakeExecutionStore) DefaultModelID(context.Context) (string, error) {
	return f.defaultID, nil
}

func (f *fakeExecutionStore) GetModelDefinition(_ context.Context, id string) (models.ModelDefinition, error) {
	if f.models == nil {
		return models.ModelDefinition{ID: id, ProviderID: "provider-1", ModelName: "local-test-model", DisplayName: "Local Test Model", Enabled: true}, nil
	}
	return f.models[id], nil
}

func (f *fakeExecutionStore) GetModelProvider(_ context.Context, id string) (models.ModelProvider, error) {
	if f.providers == nil {
		return models.ModelProvider{ID: id, AdapterKey: "local", Enabled: true}, nil
	}
	return f.providers[id], nil
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
	store := &fakeExecutionStore{batch: models.Batch{ID: "batch-1", Status: "pending"}, defaultID: "model-default"}
	dispatcher := &fakeExecutionDispatcher{}
	service := NewExecutionService(store, nil, dispatcher)

	batch, err := service.CreateBatch(context.Background(), models.BatchCreateRequest{Name: "Batch"}, "user-1")

	require.NoError(t, err)
	assert.Equal(t, "batch-1", batch.ID)
	assert.Equal(t, "batch-1", dispatcher.dispatchedBatch)
}

func TestExecutionService_CreateBatchUsesDefaultModelWhenModelIDsOmitted(t *testing.T) {
	store := &fakeExecutionStore{batch: models.Batch{ID: "batch-1", Status: "pending"}, defaultID: "model-default"}
	service := NewExecutionService(store, nil, nil)

	_, err := service.CreateBatch(context.Background(), models.BatchCreateRequest{Name: "Batch", TaskIDs: []string{"task-1"}, IterationCount: 1}, "user-1")

	require.NoError(t, err)
	assert.Equal(t, []string{"model-default"}, store.createReq.ModelIDs)
}

func TestExecutionService_CreateBatchRejectsIncompatibleModel(t *testing.T) {
	store := &fakeExecutionStore{
		batch: models.Batch{ID: "batch-1", Status: "pending"},
		models: map[string]models.ModelDefinition{
			"model-1": {ID: "model-1", ProviderID: "provider-1", ModelName: "gpt-4.1", Enabled: true},
		},
		providers: map[string]models.ModelProvider{
			"provider-1": {ID: "provider-1", AdapterKey: "openai_responses_computer", Enabled: true, SecretRef: "OPENAI_API_KEY"},
		},
	}
	dispatcher := &fakeExecutionDispatcher{}
	service := NewExecutionService(store, nil, dispatcher)

	_, err := service.CreateBatch(context.Background(), models.BatchCreateRequest{Name: "Batch", TaskIDs: []string{"task-1"}, ModelIDs: []string{"model-1"}, IterationCount: 1}, "user-1")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "computer-use-preview")
	assert.Empty(t, dispatcher.dispatchedBatch)
}

func TestExecutionService_CancelBatchCancelsEachCancelableIteration(t *testing.T) {
	store := &fakeExecutionStore{cancelIDs: []string{"iteration-1", "iteration-2"}}
	dispatcher := &fakeExecutionDispatcher{}
	service := NewExecutionService(store, nil, dispatcher)

	err := service.CancelBatch(context.Background(), "batch-1")

	require.NoError(t, err)
	assert.Equal(t, []string{"iteration-1", "iteration-2"}, dispatcher.cancelledIDs)
}
