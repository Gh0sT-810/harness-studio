package models

type Artifact struct {
	ID           string         `json:"id"`
	Scope        string         `json:"scope"`
	ArtifactType string         `json:"artifactType"`
	ObjectKey    string         `json:"objectKey"`
	SizeBytes    int64          `json:"sizeBytes"`
	ContentHash  string         `json:"contentHash"`
	Metadata     map[string]any `json:"metadata"`
	CreatedAt    string         `json:"createdAt"`
}

type TimelineStep struct {
	ID               string `json:"id"`
	Index            int    `json:"index"`
	Type             string `json:"type"`
	Message          string `json:"message"`
	URL              string `json:"url,omitempty"`
	Title            string `json:"title,omitempty"`
	BeforeArtifactID string `json:"beforeArtifactId,omitempty"`
	AfterArtifactID  string `json:"afterArtifactId,omitempty"`
}

type TimelineDocument struct {
	Version     string         `json:"version"`
	IterationID string         `json:"iterationId"`
	Steps       []TimelineStep `json:"steps"`
}
