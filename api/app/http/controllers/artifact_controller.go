package controllers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type ArtifactController struct {
	artifactProxy services.ArtifactProxyInterface
}

func NewArtifactController(artifactProxy services.ArtifactProxyInterface) *ArtifactController {
	return &ArtifactController{artifactProxy: artifactProxy}
}

func (ac *ArtifactController) GetArtifact(c *gin.Context) {
	body, contentType, err := ac.artifactProxy.GetArtifact(c.Request.Context(), c.Param("id"))
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) GetArtifactMetadata(c *gin.Context) {
	body, contentType, err := ac.artifactProxy.GetArtifactMetadata(c.Request.Context(), c.Param("id"))
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) ListIterationFiles(c *gin.Context) {
	body, contentType, err := ac.artifactProxy.ListScope(c.Request.Context(), "iterations/"+c.Param("id"))
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) GetIterationTimeline(c *gin.Context) {
	artifactID, err := ac.findIterationArtifact(c, "timeline", "")
	if err != nil {
		ac.writeProxyResponse(c, nil, "", err)
		return
	}
	body, contentType, err := ac.artifactProxy.GetArtifact(c.Request.Context(), artifactID)
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) GetIterationScreenshot(c *gin.Context) {
	artifactID, err := ac.findIterationArtifact(c, "screenshot", c.DefaultQuery("kind", "after"))
	if err != nil {
		ac.writeProxyResponse(c, nil, "", err)
		return
	}
	body, contentType, err := ac.artifactProxy.GetArtifact(c.Request.Context(), artifactID)
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) GetBatchArchive(c *gin.Context) {
	body, contentType, err := ac.artifactProxy.ArchiveBatch(c.Request.Context(), c.Param("id"))
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) writeProxyResponse(c *gin.Context, body []byte, contentType string, err error) {
	if err != nil {
		var proxyErr services.ArtifactProxyError
		if errors.As(err, &proxyErr) && proxyErr.StatusCode == http.StatusNotFound {
			utils.ErrorResponse(c, http.StatusNotFound, "artifact not found")
			return
		}
		utils.ErrorResponse(c, http.StatusBadGateway, "artifact service request failed")
		return
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Data(http.StatusOK, contentType, body)
}

type artifactSummary struct {
	ID           string         `json:"id"`
	ArtifactType string         `json:"artifactType"`
	Metadata     map[string]any `json:"metadata"`
}

func (ac *ArtifactController) findIterationArtifact(c *gin.Context, artifactType string, timelineKind string) (string, error) {
	body, _, err := ac.artifactProxy.ListScope(c.Request.Context(), "iterations/"+c.Param("id"))
	if err != nil {
		return "", err
	}
	var artifacts []artifactSummary
	if err := json.Unmarshal(body, &artifacts); err != nil {
		return "", err
	}
	var fallback string
	for _, artifact := range artifacts {
		if artifact.ArtifactType != artifactType {
			continue
		}
		if fallback == "" {
			fallback = artifact.ID
		}
		if timelineKind == "" {
			return artifact.ID, nil
		}
		if kind, ok := artifact.Metadata["timelineKind"].(string); ok && kind == timelineKind {
			return artifact.ID, nil
		}
	}
	if fallback != "" {
		return fallback, nil
	}
	return "", services.ArtifactProxyError{StatusCode: http.StatusNotFound}
}
