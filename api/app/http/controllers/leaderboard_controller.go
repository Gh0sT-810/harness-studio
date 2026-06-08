package controllers

import (
	"net/http"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type LeaderboardController struct {
	analytics services.AnalyticsServiceInterface
}

func NewLeaderboardController(analytics services.AnalyticsServiceInterface) *LeaderboardController {
	return &LeaderboardController{analytics: analytics}
}

func (lc *LeaderboardController) List(c *gin.Context) {
	var filters models.LeaderboardFilters
	_ = c.ShouldBindQuery(&filters)
	rows, err := lc.analytics.GetLeaderboard(c.Request.Context(), filters)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "leaderboard query failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "leaderboard retrieved", rows)
}
