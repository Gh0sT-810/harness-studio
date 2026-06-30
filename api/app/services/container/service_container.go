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
	workerProxy      services.WorkerProxyInterface
	workerMin        int
	workerMax        int
}

func NewContainer(postgres services.DependencyPinger, redis services.DependencyPinger, auth services.AuthServiceInterface, catalog services.CatalogServiceInterface, execution services.ExecutionServiceInterface, event services.EventServiceInterface, analytics services.AnalyticsServiceInterface, artifact services.ArtifactProxyInterface, report services.ReportProxyInterface, worker services.WorkerProxyInterface, workerMin int, workerMax int) *ServiceContainer {
	return &ServiceContainer{
		healthService:    services.NewHealthService(postgres, redis),
		authService:      auth,
		catalogService:   catalog,
		executionService: execution,
		eventService:     event,
		analyticsService: analytics,
		artifactProxy:    artifact,
		reportProxy:      report,
		workerProxy:      worker,
		workerMin:        workerMin,
		workerMax:        workerMax,
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

func (c *ServiceContainer) GetWorkerProxy() services.WorkerProxyInterface {
	return c.workerProxy
}

func (c *ServiceContainer) GetWorkerMinReplicas() int {
	return c.workerMin
}

func (c *ServiceContainer) GetWorkerMaxReplicas() int {
	return c.workerMax
}
