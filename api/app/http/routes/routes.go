package routes

import (
	"github.com/Gh0sT-810/harness-studio/api/app/http/controllers"
	"github.com/Gh0sT-810/harness-studio/api/app/http/middleware"
	"github.com/Gh0sT-810/harness-studio/api/app/services/container"
	"github.com/gin-gonic/gin"
)

func SetupRoutes(router *gin.Engine, serviceContainer *container.ServiceContainer) {
	healthController := controllers.NewHealthController(serviceContainer.GetHealthService())
	authController := controllers.NewAuthController(serviceContainer.GetAuthService())
	catalogController := controllers.NewCatalogController(serviceContainer.GetCatalogService())
	batchController := controllers.NewBatchController(serviceContainer.GetExecutionService(), serviceContainer.GetEventService())
	artifactController := controllers.NewArtifactController(serviceContainer.GetArtifactProxy())

	router.GET("/", healthController.GetRoot)
	router.GET("/health", healthController.GetHealth)

	api := router.Group("/api")

	auth := api.Group("/auth")
	auth.POST("/login", authController.Login)
	auth.POST("/refresh", authController.Refresh)
	auth.POST("/logout", authController.Logout)

	authed := api.Group("")
	authed.Use(middleware.RequireAuth(serviceContainer.GetAuthService()))
	authed.GET("/me", authController.Me)
	authed.GET("/gyms", catalogController.ListGyms)
	authed.POST("/gyms", catalogController.CreateGym)
	authed.GET("/gyms/with-task-counts", catalogController.ListGyms)
	authed.GET("/gyms/:id", catalogController.GetGym)
	authed.PUT("/gyms/:id", catalogController.UpdateGym)
	authed.DELETE("/gyms/:id", catalogController.DeleteGym)
	authed.GET("/tasks", catalogController.ListTasks)
	authed.POST("/tasks", catalogController.CreateTask)
	authed.GET("/tasks/:id", catalogController.GetTask)
	authed.PUT("/tasks/:id", catalogController.UpdateTask)
	authed.DELETE("/tasks/:id", catalogController.DeleteTask)
	authed.GET("/models", catalogController.ListModels)
	authed.GET("/model-providers", catalogController.ListModelProviders)
	authed.GET("/batches", batchController.ListBatches)
	authed.POST("/batches", batchController.CreateBatch)
	authed.POST("/batches/:id/cancel", batchController.CancelBatch)
	authed.GET("/batches/:id/snapshot", batchController.GetBatchSnapshot)
	authed.GET("/batches/:id/events", batchController.StreamBatchEvents)
	authed.GET("/artifacts/:id", artifactController.GetArtifact)
	authed.GET("/artifacts/:id/metadata", artifactController.GetArtifactMetadata)
	authed.GET("/iterations/:id/files", artifactController.ListIterationFiles)
	authed.GET("/iterations/:id/timeline", artifactController.GetIterationTimeline)
	authed.GET("/iterations/:id/screenshot", artifactController.GetIterationScreenshot)
	authed.GET("/batches/:id/archive", artifactController.GetBatchArchive)

	admin := authed.Group("")
	admin.Use(middleware.RequireAdmin())
	admin.GET("/users", authController.ListUsers)
	admin.PUT("/users/:id/role", authController.UpdateUserRole)
	admin.GET("/domains", authController.ListDomains)
	admin.POST("/domains", authController.CreateDomain)
	admin.DELETE("/domains/:id", authController.DeleteDomain)
}
