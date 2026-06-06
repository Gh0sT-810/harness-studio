package controllers

import (
	"net/http"

	"github.com/Gh0sT-810/harness-studio/api/app/http/middleware"
	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type AuthController struct {
	authService services.AuthServiceInterface
}

func NewAuthController(authService services.AuthServiceInterface) *AuthController {
	return &AuthController{authService: authService}
}

func (a *AuthController) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid login request")
		return
	}
	resp, err := a.authService.Login(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusUnauthorized, "invalid credentials")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "login successful", resp)
}

func (a *AuthController) Refresh(c *gin.Context) {
	var req models.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid refresh request")
		return
	}
	resp, err := a.authService.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		utils.ErrorResponse(c, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "token refreshed", resp)
}

func (a *AuthController) Logout(c *gin.Context) {
	var req models.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid logout request")
		return
	}
	if err := a.authService.Logout(c.Request.Context(), req.RefreshToken); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "logout failed")
		return
	}
	utils.SuccessResponseNoData(c, http.StatusOK, "logout successful")
}

func (a *AuthController) Me(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		utils.ErrorResponse(c, http.StatusUnauthorized, "missing current user")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "current user", user)
}

func (a *AuthController) ListUsers(c *gin.Context) {
	users, err := a.authService.ListUsers(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "list users failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "users retrieved", users)
}

func (a *AuthController) UpdateUserRole(c *gin.Context) {
	var req models.RoleUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid role update")
		return
	}
	user, err := a.authService.UpdateUserRole(c.Request.Context(), c.Param("id"), req.Role)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "role update failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "role updated", user)
}

func (a *AuthController) ListDomains(c *gin.Context) {
	domains, err := a.authService.ListDomains(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "list domains failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "domains retrieved", domains)
}

func (a *AuthController) CreateDomain(c *gin.Context) {
	var req models.DomainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid domain request")
		return
	}
	domain, err := a.authService.CreateDomain(c.Request.Context(), req.Domain)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "domain create failed")
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "domain created", domain)
}

func (a *AuthController) DeleteDomain(c *gin.Context) {
	if err := a.authService.DeleteDomain(c.Request.Context(), c.Param("id")); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "domain delete failed")
		return
	}
	utils.SuccessResponseNoData(c, http.StatusOK, "domain deleted")
}
