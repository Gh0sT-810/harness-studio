package services

import (
	"context"
	"errors"
	"strings"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
)

type CatalogStore interface {
	CreateGym(ctx context.Context, req models.GymRequest) (models.Gym, error)
	ListGyms(ctx context.Context) ([]models.Gym, error)
	GetGym(ctx context.Context, id string) (models.Gym, error)
	UpdateGym(ctx context.Context, id string, req models.GymRequest) (models.Gym, error)
	DeleteGym(ctx context.Context, id string) error
	CreateTask(ctx context.Context, req models.TaskRequest) (models.Task, error)
	ListTasks(ctx context.Context) ([]models.Task, error)
	GetTask(ctx context.Context, id string) (models.Task, error)
	UpdateTask(ctx context.Context, id string, req models.TaskRequest) (models.Task, error)
	DeleteTask(ctx context.Context, id string) error
	ListModelProviders(ctx context.Context) ([]models.ModelProvider, error)
	ListModelDefinitions(ctx context.Context) ([]models.ModelDefinition, error)
	GetModelProvider(ctx context.Context, id string) (models.ModelProvider, error)
	GetModelDefinition(ctx context.Context, id string) (models.ModelDefinition, error)
	CreateModelProvider(ctx context.Context, req models.ModelProviderRequest) (models.ModelProvider, error)
	UpdateModelProvider(ctx context.Context, id string, req models.ModelProviderRequest) (models.ModelProvider, error)
	CreateModelDefinition(ctx context.Context, req models.ModelDefinitionRequest) (models.ModelDefinition, error)
	UpdateModelDefinition(ctx context.Context, id string, req models.ModelDefinitionRequest) (models.ModelDefinition, error)
	SetDefaultModel(ctx context.Context, id string) (models.ModelDefinition, error)
	DeleteModelDefinition(ctx context.Context, id string) error
	GetSystemConfig(ctx context.Context, key string) (models.SystemConfig, error)
	SetSystemConfig(ctx context.Context, key string, value map[string]any) (models.SystemConfig, error)
}

type CatalogServiceInterface interface {
	CreateGym(ctx context.Context, req models.GymRequest) (models.Gym, error)
	ListGyms(ctx context.Context) ([]models.Gym, error)
	GetGym(ctx context.Context, id string) (models.Gym, error)
	UpdateGym(ctx context.Context, id string, req models.GymRequest) (models.Gym, error)
	DeleteGym(ctx context.Context, id string) error
	CreateTask(ctx context.Context, req models.TaskRequest) (models.Task, error)
	ListTasks(ctx context.Context) ([]models.Task, error)
	GetTask(ctx context.Context, id string) (models.Task, error)
	UpdateTask(ctx context.Context, id string, req models.TaskRequest) (models.Task, error)
	DeleteTask(ctx context.Context, id string) error
	ListModelProviders(ctx context.Context) ([]models.ModelProvider, error)
	ListModelDefinitions(ctx context.Context) ([]models.ModelDefinition, error)
	GetModelProvider(ctx context.Context, id string) (models.ModelProvider, error)
	GetModelDefinition(ctx context.Context, id string) (models.ModelDefinition, error)
	CreateModelProvider(ctx context.Context, req models.ModelProviderRequest) (models.ModelProvider, error)
	UpdateModelProvider(ctx context.Context, id string, req models.ModelProviderRequest) (models.ModelProvider, error)
	TestModelProvider(ctx context.Context, id string) (models.ModelTestResult, error)
	CreateModelDefinition(ctx context.Context, req models.ModelDefinitionRequest) (models.ModelDefinition, error)
	UpdateModelDefinition(ctx context.Context, id string, req models.ModelDefinitionRequest) (models.ModelDefinition, error)
	SetDefaultModel(ctx context.Context, id string) (models.ModelDefinition, error)
	TestModelDefinition(ctx context.Context, id string) (models.ModelTestResult, error)
	DeleteModelDefinition(ctx context.Context, id string) error
	GetSystemConfig(ctx context.Context, key string) (models.SystemConfig, error)
	SetSystemConfig(ctx context.Context, key string, value map[string]any) (models.SystemConfig, error)
}

type CatalogService struct {
	store CatalogStore
}

func NewCatalogService(store CatalogStore) CatalogServiceInterface {
	return &CatalogService{store: store}
}

func (s *CatalogService) CreateGym(ctx context.Context, req models.GymRequest) (models.Gym, error) {
	return s.store.CreateGym(ctx, req)
}

func (s *CatalogService) ListGyms(ctx context.Context) ([]models.Gym, error) {
	return s.store.ListGyms(ctx)
}

func (s *CatalogService) GetGym(ctx context.Context, id string) (models.Gym, error) {
	return s.store.GetGym(ctx, id)
}

func (s *CatalogService) UpdateGym(ctx context.Context, id string, req models.GymRequest) (models.Gym, error) {
	return s.store.UpdateGym(ctx, id, req)
}

func (s *CatalogService) DeleteGym(ctx context.Context, id string) error {
	return s.store.DeleteGym(ctx, id)
}

func (s *CatalogService) CreateTask(ctx context.Context, req models.TaskRequest) (models.Task, error) {
	return s.store.CreateTask(ctx, req)
}

func (s *CatalogService) ListTasks(ctx context.Context) ([]models.Task, error) {
	return s.store.ListTasks(ctx)
}

func (s *CatalogService) GetTask(ctx context.Context, id string) (models.Task, error) {
	return s.store.GetTask(ctx, id)
}

func (s *CatalogService) UpdateTask(ctx context.Context, id string, req models.TaskRequest) (models.Task, error) {
	return s.store.UpdateTask(ctx, id, req)
}

func (s *CatalogService) DeleteTask(ctx context.Context, id string) error {
	return s.store.DeleteTask(ctx, id)
}

func (s *CatalogService) ListModelProviders(ctx context.Context) ([]models.ModelProvider, error) {
	return s.store.ListModelProviders(ctx)
}

func (s *CatalogService) ListModelDefinitions(ctx context.Context) ([]models.ModelDefinition, error) {
	return s.store.ListModelDefinitions(ctx)
}

func (s *CatalogService) GetModelProvider(ctx context.Context, id string) (models.ModelProvider, error) {
	return s.store.GetModelProvider(ctx, id)
}

func (s *CatalogService) GetModelDefinition(ctx context.Context, id string) (models.ModelDefinition, error) {
	return s.store.GetModelDefinition(ctx, id)
}

func (s *CatalogService) CreateModelProvider(ctx context.Context, req models.ModelProviderRequest) (models.ModelProvider, error) {
	return s.store.CreateModelProvider(ctx, req)
}

func (s *CatalogService) UpdateModelProvider(ctx context.Context, id string, req models.ModelProviderRequest) (models.ModelProvider, error) {
	return s.store.UpdateModelProvider(ctx, id, req)
}

func (s *CatalogService) TestModelProvider(ctx context.Context, id string) (models.ModelTestResult, error) {
	provider, err := s.store.GetModelProvider(ctx, id)
	if err != nil {
		return models.ModelTestResult{}, err
	}
	return validateModelProvider(provider), nil
}

func (s *CatalogService) CreateModelDefinition(ctx context.Context, req models.ModelDefinitionRequest) (models.ModelDefinition, error) {
	provider, err := s.store.GetModelProvider(ctx, req.ProviderID)
	if err != nil {
		return models.ModelDefinition{}, err
	}
	result := validateModelCompatibility(modelDefinitionFromRequest(req), provider)
	if result.Status == "error" {
		return models.ModelDefinition{}, errors.New(result.Message)
	}
	return s.store.CreateModelDefinition(ctx, req)
}

func (s *CatalogService) UpdateModelDefinition(ctx context.Context, id string, req models.ModelDefinitionRequest) (models.ModelDefinition, error) {
	provider, err := s.store.GetModelProvider(ctx, req.ProviderID)
	if err != nil {
		return models.ModelDefinition{}, err
	}
	result := validateModelCompatibility(modelDefinitionFromRequest(req), provider)
	if result.Status == "error" {
		return models.ModelDefinition{}, errors.New(result.Message)
	}
	return s.store.UpdateModelDefinition(ctx, id, req)
}

func (s *CatalogService) SetDefaultModel(ctx context.Context, id string) (models.ModelDefinition, error) {
	return s.store.SetDefaultModel(ctx, id)
}

func (s *CatalogService) TestModelDefinition(ctx context.Context, id string) (models.ModelTestResult, error) {
	model, err := s.store.GetModelDefinition(ctx, id)
	if err != nil {
		return models.ModelTestResult{}, err
	}
	if !model.Enabled {
		return models.ModelTestResult{Status: "warning", Message: "model is disabled"}, nil
	}
	provider, err := s.store.GetModelProvider(ctx, model.ProviderID)
	if err != nil {
		return models.ModelTestResult{}, err
	}
	return validateModelCompatibility(model, provider), nil
}

func (s *CatalogService) DeleteModelDefinition(ctx context.Context, id string) error {
	return s.store.DeleteModelDefinition(ctx, id)
}

func (s *CatalogService) GetSystemConfig(ctx context.Context, key string) (models.SystemConfig, error) {
	return s.store.GetSystemConfig(ctx, key)
}

func (s *CatalogService) SetSystemConfig(ctx context.Context, key string, value map[string]any) (models.SystemConfig, error) {
	return s.store.SetSystemConfig(ctx, key, value)
}

func validateModelProvider(provider models.ModelProvider) models.ModelTestResult {
	if provider.AdapterKey == "" {
		return models.ModelTestResult{Status: "error", Message: "adapter key is required"}
	}
	supported := map[string]bool{
		"local":                     true,
		"text_only":                 true,
		"llm_grader":                true,
		"embedding":                 true,
		"openai_responses_computer": true,
		"anthropic_computer_use":    true,
		"gemini_computer_use":       true,
	}
	if !supported[provider.AdapterKey] {
		return models.ModelTestResult{Status: "error", Message: "unsupported adapter key: " + provider.AdapterKey}
	}
	if provider.BaseURL != "" && !strings.HasPrefix(provider.BaseURL, "http://") && !strings.HasPrefix(provider.BaseURL, "https://") {
		return models.ModelTestResult{Status: "error", Message: "baseUrl must start with http:// or https://"}
	}
	requiresSecret := provider.AdapterKey == "openai_responses_computer" || provider.AdapterKey == "anthropic_computer_use" || provider.AdapterKey == "gemini_computer_use" || provider.AdapterKey == "embedding"
	if requiresSecret && provider.SecretRef == "" {
		return models.ModelTestResult{Status: "error", Message: "secretRef is required for provider-backed adapters"}
	}
	return models.ModelTestResult{Status: "ok", Message: "provider config valid; mock connectivity check passed"}
}

func modelDefinitionFromRequest(req models.ModelDefinitionRequest) models.ModelDefinition {
	return models.ModelDefinition{
		ProviderID:      req.ProviderID,
		ModelName:       req.ModelName,
		DisplayName:     req.DisplayName,
		Capabilities:    req.Capabilities,
		Config:          req.Config,
		CostConfig:      req.CostConfig,
		TimeoutSeconds:  req.TimeoutSeconds,
		MaxOutputTokens: req.MaxOutputTokens,
		Enabled:         req.Enabled,
		IsDefault:       req.IsDefault,
	}
}

func validateModelCompatibility(model models.ModelDefinition, provider models.ModelProvider) models.ModelTestResult {
	if !provider.Enabled {
		return models.ModelTestResult{Status: "error", Message: "provider is disabled"}
	}
	providerResult := validateModelProvider(provider)
	if providerResult.Status == "error" {
		return providerResult
	}
	if provider.AdapterKey == "openai_responses_computer" {
		toolMode := stringConfig(model.Config, "toolMode")
		if toolMode == "" {
			toolMode = "computer_use_preview"
		}
		if toolMode != "computer_use_preview" {
			return models.ModelTestResult{Status: "error", Message: "openai_responses_computer currently supports toolMode computer_use_preview only"}
		}
		if model.ModelName != "computer-use-preview" {
			return models.ModelTestResult{Status: "error", Message: "openai_responses_computer with computer_use_preview requires computer-use-preview, got " + model.ModelName}
		}
	}
	return models.ModelTestResult{Status: "ok", Message: "model config valid"}
}

func stringConfig(config map[string]any, key string) string {
	if config == nil {
		return ""
	}
	value, ok := config[key]
	if !ok || value == nil {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return text
}
