package controllers

import (
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
	body, contentType, err := ac.artifactProxy.ListScope(c.Request.Context(), "iterations/"+c.Param("id"))
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) GetIterationScreenshot(c *gin.Context) {
	body, contentType, err := ac.artifactProxy.ListScope(c.Request.Context(), "iterations/"+c.Param("id"))
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) GetBatchArchive(c *gin.Context) {
	body, contentType, err := ac.artifactProxy.ArchiveScope(c.Request.Context(), "batches/"+c.Param("id"))
	ac.writeProxyResponse(c, body, contentType, err)
}

func (ac *ArtifactController) writeProxyResponse(c *gin.Context, body []byte, contentType string, err error) {
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadGateway, "artifact service request failed")
		return
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Data(http.StatusOK, contentType, body)
}
