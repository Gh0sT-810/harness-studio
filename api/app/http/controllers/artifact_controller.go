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
	download, err := ac.artifactProxy.GetArtifact(c.Request.Context(), c.Param("id"))
	ac.writeDownload(c, download, err)
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
	download, err := ac.artifactProxy.GetArtifact(c.Request.Context(), artifactID)
	ac.writeDownload(c, download, err)
}

func (ac *ArtifactController) GetIterationScreenshot(c *gin.Context) {
	artifactID, err := ac.findIterationArtifact(c, "screenshot", c.DefaultQuery("kind", "after"))
	if err != nil {
		ac.writeProxyResponse(c, nil, "", err)
		return
	}
	download, err := ac.artifactProxy.GetArtifact(c.Request.Context(), artifactID)
	ac.writeDownload(c, download, err)
}

func (ac *ArtifactController) GetBatchArchive(c *gin.Context) {
	download, err := ac.artifactProxy.ArchiveBatch(c.Request.Context(), c.Param("id"))
	ac.writeDownload(c, download, err)
}

func (ac *ArtifactController) writeProxyResponse(c *gin.Context, body []byte, contentType string, err error) {
	if ac.handleProxyError(c, err) {
		return
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Data(http.StatusOK, contentType, body)
}

// writeDownload forwards a binary artifact along with the upstream
// Content-Disposition so the browser saves a real file (with its original
// filename) instead of rendering the body inline.
func (ac *ArtifactController) writeDownload(c *gin.Context, download services.ArtifactDownload, err error) {
	if ac.handleProxyError(c, err) {
		return
	}
	if download.ContentDisposition != "" {
		c.Header("Content-Disposition", download.ContentDisposition)
	}
	contentType := download.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Data(http.StatusOK, contentType, download.Body)
}

func (ac *ArtifactController) handleProxyError(c *gin.Context, err error) bool {
	if err == nil {
		return false
	}
	var proxyErr services.ArtifactProxyError
	if errors.As(err, &proxyErr) && proxyErr.StatusCode == http.StatusNotFound {
		utils.ErrorResponse(c, http.StatusNotFound, "artifact not found")
		return true
	}
	utils.ErrorResponse(c, http.StatusBadGateway, "artifact service request failed")
	return true
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
