package controllers

import (
	"context"
	"net/http"
	"testing"

	"github.com/Gh0sT-810/harness-studio/api/app/http/middleware"
	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockWorkerProxy struct {
	status          models.WorkerStatus
	statusErr       error
	scaleResult     map[string]any
	scaleErr        error
	scaleCalledWith *int
	stopIdleErr     error
	restartErr      error
}

func (m *mockWorkerProxy) GetWorkerStatus(context.Context) (models.WorkerStatus, error) {
	return m.status, m.statusErr
}

func (m *mockWorkerProxy) Scale(_ context.Context, replicas int) (map[string]any, error) {
	value := replicas
	m.scaleCalledWith = &value
	if m.scaleResult == nil {
		m.scaleResult = map[string]any{"desired": replicas, "actual": replicas}
	}
	return m.scaleResult, m.scaleErr
}

func (m *mockWorkerProxy) StopIdle(context.Context, *int) (map[string]any, error) {
	return map[string]any{"stopped": []string{}}, m.stopIdleErr
}

func (m *mockWorkerProxy) RestartWorker(context.Context, string) (map[string]any, error) {
	return map[string]any{"action": "restart"}, m.restartErr
}

// mockCatalog embeds the interface so it satisfies CatalogServiceInterface; only the
// two methods the worker controller uses are implemented.
type mockCatalog struct {
	services.CatalogServiceInterface
	getConfig models.SystemConfig
	getErr    error
	setErr    error
	setValue  map[string]any
}

func (m *mockCatalog) GetSystemConfig(context.Context, string) (models.SystemConfig, error) {
	return m.getConfig, m.getErr
}

func (m *mockCatalog) SetSystemConfig(_ context.Context, key string, value map[string]any) (models.SystemConfig, error) {
	m.setValue = value
	return models.SystemConfig{Key: key, Value: value}, m.setErr
}

func setupWorkerRouter(proxy services.WorkerProxyInterface, catalog services.CatalogServiceInterface, min, max int) *gin.Engine {
	router := gin.New()
	controller := NewWorkerController(proxy, catalog, min, max)
	router.GET("/admin/workers", controller.GetWorkerStatus)
	router.POST("/admin/workers/scale", controller.Scale)
	router.POST("/admin/workers/stop-idle", controller.StopIdle)
	router.POST("/admin/workers/:id/restart", controller.RestartWorker)
	return router
}

func TestWorkerScaleHappyPersistsAndScales(t *testing.T) {
	proxy := &mockWorkerProxy{}
	catalog := &mockCatalog{getConfig: models.SystemConfig{Key: "runtime", Value: map[string]any{"defaultModelId": "m-1"}}}
	router := setupWorkerRouter(proxy, catalog, 0, 200)

	w := performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{"replicas": 5})

	assert.Equal(t, http.StatusOK, w.Code)
	require.NotNil(t, proxy.scaleCalledWith)
	assert.Equal(t, 5, *proxy.scaleCalledWith)
	assert.Equal(t, 5, catalog.setValue["workerReplicas"])
	assert.Equal(t, "m-1", catalog.setValue["defaultModelId"]) // existing keys preserved
}

func TestWorkerScaleRejectsOutOfRangeBeforeProxy(t *testing.T) {
	proxy := &mockWorkerProxy{}
	router := setupWorkerRouter(proxy, &mockCatalog{}, 0, 200)

	w := performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{"replicas": 9999})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Nil(t, proxy.scaleCalledWith)
}

func TestWorkerScaleRejectsMissingReplicas(t *testing.T) {
	router := setupWorkerRouter(&mockWorkerProxy{}, &mockCatalog{}, 0, 200)
	w := performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{})
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestWorkerScaleRejectsNonIntegerReplicas(t *testing.T) {
	router := setupWorkerRouter(&mockWorkerProxy{}, &mockCatalog{}, 0, 200)
	w := performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{"replicas": "five"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestWorkerScaleAtBoundsAccepted(t *testing.T) {
	router := setupWorkerRouter(&mockWorkerProxy{}, &mockCatalog{}, 0, 200)
	assert.Equal(t, http.StatusOK, performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{"replicas": 0}).Code)
	assert.Equal(t, http.StatusOK, performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{"replicas": 200}).Code)
}

func TestWorkerScalerErrorMapsToBadGateway(t *testing.T) {
	proxy := &mockWorkerProxy{scaleErr: services.WorkerProxyError{StatusCode: http.StatusBadGateway}}
	router := setupWorkerRouter(proxy, &mockCatalog{}, 0, 200)
	w := performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{"replicas": 3})
	assert.Equal(t, http.StatusBadGateway, w.Code)
}

func TestWorkerScalePersistFailureIsSurfaced(t *testing.T) {
	proxy := &mockWorkerProxy{}
	router := setupWorkerRouter(proxy, &mockCatalog{setErr: assertErr("db down")}, 0, 200)
	w := performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{"replicas": 3})
	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Nil(t, proxy.scaleCalledWith) // proxy not called when persistence fails
}

func TestWorkerStatusHappyOverlaysDesired(t *testing.T) {
	proxy := &mockWorkerProxy{status: models.WorkerStatus{Actual: 2, Total: 2, FlowerAvailable: true}}
	catalog := &mockCatalog{getConfig: models.SystemConfig{Key: "runtime", Value: map[string]any{"workerReplicas": float64(6)}}}
	router := setupWorkerRouter(proxy, catalog, 0, 200)

	w := performRequest(router, http.MethodGet, "/admin/workers", nil)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "\"desired\":6")
}

func TestWorkerStatusProxyDownMapsToBadGateway(t *testing.T) {
	proxy := &mockWorkerProxy{statusErr: services.WorkerProxyError{StatusCode: http.StatusInternalServerError}}
	router := setupWorkerRouter(proxy, &mockCatalog{}, 0, 200)
	w := performRequest(router, http.MethodGet, "/admin/workers", nil)
	assert.Equal(t, http.StatusBadGateway, w.Code)
}

func TestWorkerStopIdleRejectsNonPositiveCount(t *testing.T) {
	router := setupWorkerRouter(&mockWorkerProxy{}, &mockCatalog{}, 0, 200)
	w := performRequest(router, http.MethodPost, "/admin/workers/stop-idle", map[string]any{"count": -1})
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestWorkerStopIdleHappy(t *testing.T) {
	router := setupWorkerRouter(&mockWorkerProxy{}, &mockCatalog{}, 0, 200)
	w := performRequest(router, http.MethodPost, "/admin/workers/stop-idle", map[string]any{"count": 2})
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestWorkerRestartUnknownMapsTo404(t *testing.T) {
	proxy := &mockWorkerProxy{restartErr: services.WorkerProxyError{StatusCode: http.StatusNotFound}}
	router := setupWorkerRouter(proxy, &mockCatalog{}, 0, 200)
	w := performRequest(router, http.MethodPost, "/admin/workers/missing/restart", nil)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestWorkerRestartHappy(t *testing.T) {
	router := setupWorkerRouter(&mockWorkerProxy{}, &mockCatalog{}, 0, 200)
	w := performRequest(router, http.MethodPost, "/admin/workers/c1/restart", nil)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestWorkerScaleRequiresAdmin(t *testing.T) {
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(middleware.CurrentUserKey, models.User{Role: "user"})
		c.Next()
	})
	admin := router.Group("")
	admin.Use(middleware.RequireAdmin())
	controller := NewWorkerController(&mockWorkerProxy{}, &mockCatalog{}, 0, 200)
	admin.POST("/admin/workers/scale", controller.Scale)

	w := performRequest(router, http.MethodPost, "/admin/workers/scale", map[string]any{"replicas": 3})

	assert.Equal(t, http.StatusForbidden, w.Code)
}

type assertErr string

func (e assertErr) Error() string { return string(e) }
