package models

import "time"

type Gym struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	BaseURL              string    `json:"baseUrl"`
	Description          string    `json:"description"`
	VerificationStrategy string    `json:"verificationStrategy"`
	FlowCount            int       `json:"flowCount"`
	SimilarityEnabled    bool      `json:"similarityEnabled"`
	SimilarityThreshold  float64   `json:"similarityThreshold"`
	NextTaskNumber       int       `json:"nextTaskNumber"`
	TaskCount            int       `json:"taskCount,omitempty"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type GymRequest struct {
	Name                 string  `json:"name" binding:"required"`
	BaseURL              string  `json:"baseUrl" binding:"required"`
	Description          string  `json:"description"`
	VerificationStrategy string  `json:"verificationStrategy"`
	FlowCount            int     `json:"flowCount"`
	SimilarityEnabled    bool    `json:"similarityEnabled"`
	SimilarityThreshold  float64 `json:"similarityThreshold"`
}

type Task struct {
	ID              string         `json:"id"`
	GymID           string         `json:"gymId"`
	TaskID          string         `json:"taskId"`
	Prompt          string         `json:"prompt"`
	GraderConfig    map[string]any `json:"graderConfig"`
	SimulatorConfig map[string]any `json:"simulatorConfig"`
	DBJSONValidator map[string]any `json:"dbJsonValidator"`
	VerifierPath    string         `json:"verifierPath"`
	ImportMetadata  map[string]any `json:"importMetadata"`
	ExportMetadata  map[string]any `json:"exportMetadata"`
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
}

type TaskRequest struct {
	GymID           string         `json:"gymId" binding:"required"`
	TaskID          string         `json:"taskId" binding:"required"`
	Prompt          string         `json:"prompt" binding:"required"`
	GraderConfig    map[string]any `json:"graderConfig"`
	SimulatorConfig map[string]any `json:"simulatorConfig"`
	DBJSONValidator map[string]any `json:"dbJsonValidator"`
	VerifierPath    string         `json:"verifierPath"`
}

type ModelProvider struct {
	ID          string         `json:"id"`
	Key         string         `json:"key"`
	Name        string         `json:"name"`
	DisplayName string         `json:"displayName"`
	AdapterKey  string         `json:"adapterKey"`
	BaseURL     string         `json:"baseUrl"`
	SecretRef   string         `json:"secretRef"`
	Enabled     bool           `json:"enabled"`
	Config      map[string]any `json:"config"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

type ModelDefinition struct {
	ID              string         `json:"id"`
	ProviderID      string         `json:"providerId"`
	ModelName       string         `json:"modelName"`
	DisplayName     string         `json:"displayName"`
	Capabilities    map[string]any `json:"capabilities"`
	Config          map[string]any `json:"config"`
	CostConfig      map[string]any `json:"costConfig"`
	TimeoutSeconds  int            `json:"timeoutSeconds"`
	MaxOutputTokens int            `json:"maxOutputTokens"`
	Enabled         bool           `json:"enabled"`
	IsDefault       bool           `json:"isDefault"`
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
}

type ModelProviderRequest struct {
	Key         string         `json:"key" binding:"required"`
	Name        string         `json:"name"`
	DisplayName string         `json:"displayName" binding:"required"`
	AdapterKey  string         `json:"adapterKey" binding:"required"`
	BaseURL     string         `json:"baseUrl"`
	SecretRef   string         `json:"secretRef"`
	Enabled     bool           `json:"enabled"`
	Config      map[string]any `json:"config"`
}

type ModelDefinitionRequest struct {
	ProviderID      string         `json:"providerId" binding:"required"`
	ModelName       string         `json:"modelName" binding:"required"`
	DisplayName     string         `json:"displayName" binding:"required"`
	Capabilities    map[string]any `json:"capabilities"`
	Config          map[string]any `json:"config"`
	CostConfig      map[string]any `json:"costConfig"`
	TimeoutSeconds  int            `json:"timeoutSeconds"`
	MaxOutputTokens int            `json:"maxOutputTokens"`
	Enabled         bool           `json:"enabled"`
	IsDefault       bool           `json:"isDefault"`
}

type ModelTestResult struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

type SystemConfig struct {
	Key       string         `json:"key"`
	Value     map[string]any `json:"value"`
	UpdatedAt string         `json:"updatedAt,omitempty"`
}
