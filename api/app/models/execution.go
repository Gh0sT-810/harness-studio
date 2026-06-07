package models

import "time"

type Batch struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	GymID            string    `json:"gymId"`
	CreatedBy        string    `json:"createdBy"`
	IterationCount   int       `json:"iterationCount"`
	RerunEnabled     bool      `json:"rerunEnabled"`
	NotificationRead bool      `json:"notificationRead"`
	Status           string    `json:"status"`
	CreatedAt        time.Time `json:"createdAt"`
}

type BatchCreateRequest struct {
	Name           string   `json:"name" binding:"required"`
	GymID          string   `json:"gymId" binding:"required"`
	TaskIDs        []string `json:"taskIds" binding:"required"`
	ModelIDs       []string `json:"modelIds" binding:"required"`
	IterationCount int      `json:"iterationCount" binding:"required"`
	RerunEnabled   bool     `json:"rerunEnabled"`
}

type Execution struct {
	ID                           string         `json:"id"`
	BatchID                      string         `json:"batchId"`
	GymID                        string         `json:"gymId"`
	TaskID                       string         `json:"taskId"`
	ModelID                      string         `json:"modelId"`
	ExecutionType                string         `json:"executionType"`
	Status                       string         `json:"status"`
	SnapshotTaskID               string         `json:"snapshotTaskId"`
	SnapshotPrompt               string         `json:"snapshotPrompt"`
	SnapshotGraderConfig         map[string]any `json:"snapshotGraderConfig"`
	SnapshotSimulatorConfig      map[string]any `json:"snapshotSimulatorConfig"`
	SnapshotDBJSONValidator      map[string]any `json:"snapshotDbJsonValidator"`
	SnapshotVerifierPath         string         `json:"snapshotVerifierPath"`
	SnapshotVerificationStrategy string         `json:"snapshotVerificationStrategy"`
	CreatedAt                    time.Time      `json:"createdAt"`
}

type Iteration struct {
	ID                 string         `json:"id"`
	ExecutionID        string         `json:"executionId"`
	IterationNumber    int            `json:"iterationNumber"`
	Status             string         `json:"status"`
	SubStatus          string         `json:"subStatus"`
	FailureContext     string         `json:"failureContext"`
	Attempt            int            `json:"attempt"`
	CeleryTaskID       string         `json:"celeryTaskId"`
	WorkerID           string         `json:"workerId"`
	HeartbeatAt        string         `json:"heartbeatAt,omitempty"`
	LeaseExpiresAt     string         `json:"leaseExpiresAt,omitempty"`
	CancelRequested    bool           `json:"cancelRequested"`
	CancelledAt        string         `json:"cancelledAt,omitempty"`
	StartedAt          string         `json:"startedAt,omitempty"`
	CompletedAt        string         `json:"completedAt,omitempty"`
	TimelineArtifactID string         `json:"timelineArtifactId,omitempty"`
	ResultData         map[string]any `json:"resultData"`
	TotalSteps         int            `json:"totalSteps"`
	CreatedAt          time.Time      `json:"createdAt"`
}

type BatchSnapshot struct {
	Batch      Batch           `json:"batch"`
	Executions []Execution     `json:"executions"`
	Iterations []Iteration     `json:"iterations"`
	Counts     map[string]int  `json:"counts"`
	Report     map[string]any  `json:"report"`
	Catalog    SnapshotCatalog `json:"catalog"`
}

type SnapshotCatalog struct {
	Gyms   map[string]Gym             `json:"gyms"`
	Tasks  map[string]Task            `json:"tasks"`
	Models map[string]ModelDefinition `json:"models"`
}
