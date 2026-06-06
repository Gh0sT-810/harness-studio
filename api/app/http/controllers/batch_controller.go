package controllers

import (
	"net/http"

	"github.com/Gh0sT-810/harness-studio/api/app/http/middleware"
	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type BatchController struct {
	executionService services.ExecutionServiceInterface
}

func NewBatchController(executionService services.ExecutionServiceInterface) *BatchController {
	return &BatchController{executionService: executionService}
}

func (bc *BatchController) CreateBatch(c *gin.Context) {
	var req models.BatchCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid batch request")
		return
	}
	user, _ := middleware.CurrentUser(c)
	batch, err := bc.executionService.CreateBatch(c.Request.Context(), req, user.ID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "create batch failed")
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "batch created", batch)
}

func (bc *BatchController) ListBatches(c *gin.Context) {
	batches, err := bc.executionService.ListBatches(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "list batches failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "batches retrieved", batches)
}

func (bc *BatchController) GetBatchSnapshot(c *gin.Context) {
	snapshot, err := bc.executionService.GetBatchSnapshot(c.Request.Context(), c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "batch snapshot not found")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "batch snapshot retrieved", snapshot)
}
