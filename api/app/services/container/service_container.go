package container

import "github.com/Gh0sT-810/harness-studio/api/app/services"

type ServiceContainer struct {
	healthService    services.HealthServiceInterface
	authService      services.AuthServiceInterface
	catalogService   services.CatalogServiceInterface
	executionService services.ExecutionServiceInterface
}

func NewContainer(postgres services.DependencyPinger, redis services.DependencyPinger, auth services.AuthServiceInterface, catalog services.CatalogServiceInterface, execution services.ExecutionServiceInterface) *ServiceContainer {
	return &ServiceContainer{
		healthService:    services.NewHealthService(postgres, redis),
		authService:      auth,
		catalogService:   catalog,
		executionService: execution,
	}
}

func (c *ServiceContainer) GetHealthService() services.HealthServiceInterface {
	return c.healthService
}

func (c *ServiceContainer) GetAuthService() services.AuthServiceInterface {
	return c.authService
}

func (c *ServiceContainer) GetCatalogService() services.CatalogServiceInterface {
	return c.catalogService
}

func (c *ServiceContainer) GetExecutionService() services.ExecutionServiceInterface {
	return c.executionService
}
