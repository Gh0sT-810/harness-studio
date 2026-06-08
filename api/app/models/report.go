package models

type ReportCreateRequest struct {
	JobType     string         `json:"jobType"`
	ScopeType   string         `json:"scopeType"`
	ScopeID     string         `json:"scopeId" binding:"required"`
	Format      string         `json:"format"`
	Payload     map[string]any `json:"payload,omitempty"`
	RequestedBy string         `json:"requestedBy,omitempty"`
}

type ReportJob struct {
	ID                  string         `json:"id"`
	JobType             string         `json:"jobType"`
	ScopeType           string         `json:"scopeType"`
	ScopeID             string         `json:"scopeId"`
	Format              string         `json:"format"`
	Payload             map[string]any `json:"payload,omitempty"`
	Status              string         `json:"status"`
	Error               string         `json:"error,omitempty"`
	GeneratedArtifactID string         `json:"generatedArtifactId,omitempty"`
	RequestedBy         string         `json:"requestedBy,omitempty"`
	CreatedAt           string         `json:"createdAt,omitempty"`
	StartedAt           string         `json:"startedAt,omitempty"`
	CompletedAt         string         `json:"completedAt,omitempty"`
}

type ReportReadiness struct {
	Status      string `json:"status"`
	ReportJobID string `json:"reportJobId,omitempty"`
	ArtifactID  string `json:"artifactId,omitempty"`
	RequestedAt string `json:"requestedAt,omitempty"`
	CompletedAt string `json:"completedAt,omitempty"`
	Error       string `json:"error,omitempty"`
}
