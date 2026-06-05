package controllers

import (
	"net/http"

	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type HealthController struct {
	healthService services.HealthServiceInterface
}

func NewHealthController(healthService services.HealthServiceInterface) *HealthController {
	return &HealthController{healthService: healthService}
}

func (h *HealthController) GetHealth(c *gin.Context) {
	health := h.healthService.Check(c.Request.Context())
	if health.Status != "ok" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "service dependencies unavailable")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "service healthy", health)
}

func (h *HealthController) GetRoot(c *gin.Context) {
	utils.SuccessResponse(c, http.StatusOK, "harness api ready", gin.H{
		"service": "harness-api",
	})
}
