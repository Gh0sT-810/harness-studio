package container

import "github.com/Gh0sT-810/harness-studio/api/app/services"

type ServiceContainer struct {
	healthService    services.HealthServiceInterface
	authService      services.AuthServiceInterface
	catalogService   services.CatalogServiceInterface
	executionService services.ExecutionServiceInterface
	eventService     services.EventServiceInterface
	analyticsService services.AnalyticsServiceInterface
	artifactProxy    services.ArtifactProxyInterface
	reportProxy      services.ReportProxyInterface
}

func NewContainer(postgres services.DependencyPinger, redis services.DependencyPinger, auth services.AuthServiceInterface, catalog services.CatalogServiceInterface, execution services.ExecutionServiceInterface, event services.EventServiceInterface, analytics services.AnalyticsServiceInterface, artifact services.ArtifactProxyInterface, report services.ReportProxyInterface) *ServiceContainer {
	return &ServiceContainer{
		healthService:    services.NewHealthService(postgres, redis),
		authService:      auth,
		catalogService:   catalog,
		executionService: execution,
		eventService:     event,
		analyticsService: analytics,
		artifactProxy:    artifact,
		reportProxy:      report,
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

func (c *ServiceContainer) GetEventService() services.EventServiceInterface {
	return c.eventService
}

func (c *ServiceContainer) GetAnalyticsService() services.AnalyticsServiceInterface {
	return c.analyticsService
}

func (c *ServiceContainer) GetArtifactProxy() services.ArtifactProxyInterface {
	return c.artifactProxy
}

func (c *ServiceContainer) GetReportProxy() services.ReportProxyInterface {
	return c.reportProxy
}
