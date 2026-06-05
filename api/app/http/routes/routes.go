package routes

import (
	"github.com/Gh0sT-810/harness-studio/api/app/http/controllers"
	"github.com/Gh0sT-810/harness-studio/api/app/services/container"
	"github.com/gin-gonic/gin"
)

func SetupRoutes(router *gin.Engine, serviceContainer *container.ServiceContainer) {
	healthController := controllers.NewHealthController(serviceContainer.GetHealthService())

	router.GET("/", healthController.GetRoot)
	router.GET("/health", healthController.GetHealth)
}
