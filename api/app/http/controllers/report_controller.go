package controllers

import (
	"errors"
	"net/http"

	"github.com/Gh0sT-810/harness-studio/api/app/http/middleware"
	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type ReportController struct {
	proxy services.ReportProxyInterface
}

func NewReportController(proxy services.ReportProxyInterface) *ReportController {
	return &ReportController{proxy: proxy}
}

func (rc *ReportController) CreateReport(c *gin.Context) {
	var req models.ReportCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid report request")
		return
	}
	if req.JobType == "" {
		req.JobType = "batch_report"
	}
	if req.ScopeType == "" {
		req.ScopeType = "batch"
	}
	if req.Format == "" {
		req.Format = "json"
	}
	if user, ok := middleware.CurrentUser(c); ok {
		req.RequestedBy = user.ID
	}
	report, err := rc.proxy.CreateReport(c.Request.Context(), req)
	if err != nil {
		rc.writeProxyError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "report created", report)
}

func (rc *ReportController) GetReport(c *gin.Context) {
	report, err := rc.proxy.GetReport(c.Request.Context(), c.Param("id"))
	if err != nil {
		rc.writeProxyError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "report retrieved", report)
}

func (rc *ReportController) CreateBatchReport(c *gin.Context) {
	req := models.ReportCreateRequest{JobType: "batch_report", ScopeType: "batch", ScopeID: c.Param("id"), Format: "json"}
	if user, ok := middleware.CurrentUser(c); ok {
		req.RequestedBy = user.ID
	}
	created, err := rc.proxy.CreateReport(c.Request.Context(), req)
	if err != nil {
		rc.writeProxyError(c, err)
		return
	}
	report, err := rc.proxy.RunReport(c.Request.Context(), created.ID)
	if err != nil {
		rc.writeProxyError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusAccepted, "batch report requested", report)
}

func (rc *ReportController) GetBatchReport(c *gin.Context) {
	report, err := rc.proxy.GetBatchReport(c.Request.Context(), c.Param("id"))
	if err != nil {
		rc.writeProxyError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "batch report retrieved", report)
}

func (rc *ReportController) writeProxyError(c *gin.Context, err error) {
	var proxyErr services.ReportProxyError
	if errors.As(err, &proxyErr) && proxyErr.StatusCode == http.StatusNotFound {
		utils.ErrorResponse(c, http.StatusNotFound, "report not found")
		return
	}
	utils.ErrorResponse(c, http.StatusBadGateway, "report service unavailable")
}
