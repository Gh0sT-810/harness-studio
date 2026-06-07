package middleware

import (
	"net/http"
	"strings"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

const CurrentUserKey = "currentUser"

func RequireAuth(authService services.AuthServiceInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token := strings.TrimPrefix(header, "Bearer ")
		if token == "" || token == header {
			token = c.Query("access_token")
			if token == "" {
				utils.ErrorResponse(c, http.StatusUnauthorized, "missing bearer token")
				c.Abort()
				return
			}
		}

		user, err := authService.CurrentUser(c.Request.Context(), token)
		if err != nil {
			utils.ErrorResponse(c, http.StatusUnauthorized, "invalid bearer token")
			c.Abort()
			return
		}

		c.Set(CurrentUserKey, user)
		c.Next()
	}
}

func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentUser(c)
		if !ok || user.Role != "admin" {
			utils.ErrorResponse(c, http.StatusForbidden, "admin role required")
			c.Abort()
			return
		}
		c.Next()
	}
}

func CurrentUser(c *gin.Context) (models.User, bool) {
	value, ok := c.Get(CurrentUserKey)
	if !ok {
		return models.User{}, false
	}
	user, ok := value.(models.User)
	return user, ok
}
