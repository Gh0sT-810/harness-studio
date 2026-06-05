package container

import "github.com/Gh0sT-810/harness-studio/api/app/services"

type ServiceContainer struct {
	healthService services.HealthServiceInterface
}

func NewContainer(postgres services.DependencyPinger, redis services.DependencyPinger) *ServiceContainer {
	return &ServiceContainer{
		healthService: services.NewHealthService(postgres, redis),
	}
}

func (c *ServiceContainer) GetHealthService() services.HealthServiceInterface {
	return c.healthService
}
