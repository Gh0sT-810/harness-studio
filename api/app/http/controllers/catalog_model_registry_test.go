package controllers

import (
	"context"
	"net/http"
	"testing"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type mockCatalogService struct {
	provider models.ModelProvider
	model    models.ModelDefinition
	config   models.SystemConfig
}

func (m mockCatalogService) CreateGym(context.Context, models.GymRequest) (models.Gym, error) {
	return models.Gym{}, nil
}
func (m mockCatalogService) ListGyms(context.Context) ([]models.Gym, error) { return nil, nil }
func (m mockCatalogService) GetGym(context.Context, string) (models.Gym, error) {
	return models.Gym{}, nil
}
func (m mockCatalogService) UpdateGym(context.Context, string, models.GymRequest) (models.Gym, error) {
	return models.Gym{}, nil
}
func (m mockCatalogService) DeleteGym(context.Context, string) error { return nil }
func (m mockCatalogService) CreateTask(context.Context, models.TaskRequest) (models.Task, error) {
	return models.Task{}, nil
}
func (m mockCatalogService) ListTasks(context.Context) ([]models.Task, error) { return nil, nil }
func (m mockCatalogService) GetTask(context.Context, string) (models.Task, error) {
	return models.Task{}, nil
}
func (m mockCatalogService) UpdateTask(context.Context, string, models.TaskRequest) (models.Task, error) {
	return models.Task{}, nil
}
func (m mockCatalogService) DeleteTask(context.Context, string) error { return nil }
func (m mockCatalogService) ListModelProviders(context.Context) ([]models.ModelProvider, error) {
	return nil, nil
}
func (m mockCatalogService) ListModelDefinitions(context.Context) ([]models.ModelDefinition, error) {
	return nil, nil
}
func (m mockCatalogService) GetModelProvider(context.Context, string) (models.ModelProvider, error) {
	return m.provider, nil
}
func (m mockCatalogService) GetModelDefinition(context.Context, string) (models.ModelDefinition, error) {
	return m.model, nil
}
func (m mockCatalogService) CreateModelProvider(context.Context, models.ModelProviderRequest) (models.ModelProvider, error) {
	return m.provider, nil
}
func (m mockCatalogService) UpdateModelProvider(context.Context, string, models.ModelProviderRequest) (models.ModelProvider, error) {
	return m.provider, nil
}
func (m mockCatalogService) TestModelProvider(context.Context, string) (models.ModelTestResult, error) {
	return models.ModelTestResult{Status: "ok", Message: "provider config reachable"}, nil
}
func (m mockCatalogService) CreateModelDefinition(context.Context, models.ModelDefinitionRequest) (models.ModelDefinition, error) {
	return m.model, nil
}
func (m mockCatalogService) UpdateModelDefinition(context.Context, string, models.ModelDefinitionRequest) (models.ModelDefinition, error) {
	return m.model, nil
}
func (m mockCatalogService) SetDefaultModel(context.Context, string) (models.ModelDefinition, error) {
	return m.model, nil
}
func (m mockCatalogService) TestModelDefinition(context.Context, string) (models.ModelTestResult, error) {
	return models.ModelTestResult{Status: "ok", Message: "model config valid"}, nil
}
func (m mockCatalogService) DeleteModelDefinition(context.Context, string) error { return nil }
func (m mockCatalogService) GetSystemConfig(context.Context, string) (models.SystemConfig, error) {
	return m.config, nil
}
func (m mockCatalogService) SetSystemConfig(context.Context, string, map[string]any) (models.SystemConfig, error) {
	return m.config, nil
}

func setupCatalogAdminRouter(service mockCatalogService) *gin.Engine {
	router := gin.New()
	controller := NewCatalogController(service)
	router.POST("/model-providers", controller.CreateModelProvider)
	router.POST("/models/:id/default", controller.SetDefaultModel)
	router.GET("/admin/runtime-config", controller.GetRuntimeConfig)
	router.PUT("/admin/runtime-config", controller.UpdateRuntimeConfig)
	return router
}

func TestCatalogControllerCreatesModelProvider(t *testing.T) {
	router := setupCatalogAdminRouter(mockCatalogService{provider: models.ModelProvider{ID: "provider-1", Key: "openai", DisplayName: "OpenAI", AdapterKey: "openai_responses_computer", Enabled: true}})

	w := performRequest(router, http.MethodPost, "/model-providers", map[string]any{
		"key": "openai", "displayName": "OpenAI", "adapterKey": "openai_responses_computer", "enabled": true,
	})

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Body.String(), "provider-1")
	assert.Contains(t, w.Body.String(), "openai_responses_computer")
}

func TestCatalogControllerSetsDefaultModel(t *testing.T) {
	router := setupCatalogAdminRouter(mockCatalogService{model: models.ModelDefinition{ID: "model-1", DisplayName: "GPT", IsDefault: true}})

	w := performRequest(router, http.MethodPost, "/models/model-1/default", nil)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "model-1")
}

func TestCatalogControllerReadsAndWritesRuntimeConfig(t *testing.T) {
	router := setupCatalogAdminRouter(mockCatalogService{config: models.SystemConfig{Key: "runtime", Value: map[string]any{"modelCallTimeoutSeconds": float64(30)}}})

	getResponse := performRequest(router, http.MethodGet, "/admin/runtime-config", nil)
	putResponse := performRequest(router, http.MethodPut, "/admin/runtime-config", map[string]any{"modelCallTimeoutSeconds": 30})

	assert.Equal(t, http.StatusOK, getResponse.Code)
	assert.Contains(t, getResponse.Body.String(), "modelCallTimeoutSeconds")
	assert.Equal(t, http.StatusOK, putResponse.Code)
}
