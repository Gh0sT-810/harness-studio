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
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	AdapterKey string         `json:"adapterKey"`
	Enabled    bool           `json:"enabled"`
	Config     map[string]any `json:"config"`
	CreatedAt  time.Time      `json:"createdAt"`
}

type ModelDefinition struct {
	ID           string         `json:"id"`
	ProviderID   string         `json:"providerId"`
	ModelName    string         `json:"modelName"`
	DisplayName  string         `json:"displayName"`
	Capabilities map[string]any `json:"capabilities"`
	CostConfig   map[string]any `json:"costConfig"`
	Enabled      bool           `json:"enabled"`
	IsDefault    bool           `json:"isDefault"`
	CreatedAt    time.Time      `json:"createdAt"`
}
