package controllers

import (
	"net/http"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type TokenUsageController struct {
	analytics services.AnalyticsServiceInterface
}

func NewTokenUsageController(analytics services.AnalyticsServiceInterface) *TokenUsageController {
	return &TokenUsageController{analytics: analytics}
}

func (tc *TokenUsageController) Summary(c *gin.Context) {
	var filters models.UsageFilters
	_ = c.ShouldBindQuery(&filters)
	summary, err := tc.analytics.GetTokenUsageSummary(c.Request.Context(), filters)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "token usage summary failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "token usage summary retrieved", summary)
}

func (tc *TokenUsageController) Filters(c *gin.Context) {
	filters, err := tc.analytics.GetTokenUsageFilters(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "token usage filters failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "token usage filters retrieved", filters)
}

func (tc *TokenUsageController) ExportCSV(c *gin.Context) {
	var filters models.UsageFilters
	_ = c.ShouldBindQuery(&filters)
	csvBytes, err := tc.analytics.ExportTokenUsageCSV(c.Request.Context(), filters)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "token usage export failed")
		return
	}
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", `attachment; filename="token_usage.csv"`)
	c.String(http.StatusOK, string(csvBytes))
}
