package controllers

import (
	"net/http"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type CatalogController struct {
	catalogService services.CatalogServiceInterface
}

func NewCatalogController(catalogService services.CatalogServiceInterface) *CatalogController {
	return &CatalogController{catalogService: catalogService}
}

func (cc *CatalogController) ListGyms(c *gin.Context) {
	items, err := cc.catalogService.ListGyms(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "list gyms failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "gyms retrieved", items)
}

func (cc *CatalogController) CreateGym(c *gin.Context) {
	var req models.GymRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid gym request")
		return
	}
	item, err := cc.catalogService.CreateGym(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "create gym failed")
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "gym created", item)
}

func (cc *CatalogController) GetGym(c *gin.Context) {
	item, err := cc.catalogService.GetGym(c.Request.Context(), c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "gym not found")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "gym retrieved", item)
}

func (cc *CatalogController) UpdateGym(c *gin.Context) {
	var req models.GymRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid gym request")
		return
	}
	item, err := cc.catalogService.UpdateGym(c.Request.Context(), c.Param("id"), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "update gym failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "gym updated", item)
}

func (cc *CatalogController) DeleteGym(c *gin.Context) {
	if err := cc.catalogService.DeleteGym(c.Request.Context(), c.Param("id")); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "delete gym failed")
		return
	}
	utils.SuccessResponseNoData(c, http.StatusOK, "gym deleted")
}

func (cc *CatalogController) ListTasks(c *gin.Context) {
	items, err := cc.catalogService.ListTasks(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "list tasks failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "tasks retrieved", items)
}

func (cc *CatalogController) CreateTask(c *gin.Context) {
	var req models.TaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid task request")
		return
	}
	item, err := cc.catalogService.CreateTask(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "create task failed")
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "task created", item)
}

func (cc *CatalogController) GetTask(c *gin.Context) {
	item, err := cc.catalogService.GetTask(c.Request.Context(), c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "task not found")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "task retrieved", item)
}

func (cc *CatalogController) UpdateTask(c *gin.Context) {
	var req models.TaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid task request")
		return
	}
	item, err := cc.catalogService.UpdateTask(c.Request.Context(), c.Param("id"), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "update task failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "task updated", item)
}

func (cc *CatalogController) DeleteTask(c *gin.Context) {
	if err := cc.catalogService.DeleteTask(c.Request.Context(), c.Param("id")); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "delete task failed")
		return
	}
	utils.SuccessResponseNoData(c, http.StatusOK, "task deleted")
}

func (cc *CatalogController) ListModelProviders(c *gin.Context) {
	items, err := cc.catalogService.ListModelProviders(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "list model providers failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "model providers retrieved", items)
}

func (cc *CatalogController) ListModels(c *gin.Context) {
	items, err := cc.catalogService.ListModelDefinitions(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "list models failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "models retrieved", items)
}
