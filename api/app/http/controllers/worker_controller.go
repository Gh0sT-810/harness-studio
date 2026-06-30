package controllers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

const runtimeConfigKey = "runtime"
const workerReplicasField = "workerReplicas"

// WorkerController is the admin facade over the internal worker-scaler service.
// It enforces admin RBAC (via the route group) and replica bounds, persists the
// desired replica count to runtime config, and proxies to the scaler. It never
// talks to Docker/Redis/Celery directly.
type WorkerController struct {
	proxy       services.WorkerProxyInterface
	catalog     services.CatalogServiceInterface
	minReplicas int
	maxReplicas int
}

func NewWorkerController(proxy services.WorkerProxyInterface, catalog services.CatalogServiceInterface, minReplicas, maxReplicas int) *WorkerController {
	return &WorkerController{proxy: proxy, catalog: catalog, minReplicas: minReplicas, maxReplicas: maxReplicas}
}

func (wc *WorkerController) GetWorkerStatus(c *gin.Context) {
	status, err := wc.proxy.GetWorkerStatus(c.Request.Context())
	if err != nil {
		wc.writeProxyError(c, err)
		return
	}
	if cfg, cfgErr := wc.catalog.GetSystemConfig(c.Request.Context(), runtimeConfigKey); cfgErr == nil {
		if desired, ok := intFromConfig(cfg.Value[workerReplicasField]); ok {
			status.Desired = &desired
		}
	}
	utils.SuccessResponse(c, http.StatusOK, "workers retrieved", status)
}

func (wc *WorkerController) Scale(c *gin.Context) {
	var req struct {
		Replicas *int `json:"replicas"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Replicas == nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "replicas is required and must be an integer")
		return
	}
	replicas := *req.Replicas
	if replicas < wc.minReplicas || replicas > wc.maxReplicas {
		utils.ErrorResponse(c, http.StatusBadRequest, "replicas out of range")
		return
	}
	// Persist desired BEFORE scaling so a scaler failure still leaves the target
	// recorded and startup reconcile converges to it.
	if err := wc.persistReplicas(c, replicas); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "failed to persist worker replicas")
		return
	}
	result, err := wc.proxy.Scale(c.Request.Context(), replicas)
	if err != nil {
		wc.writeProxyError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "workers scaled", result)
}

func (wc *WorkerController) StopIdle(c *gin.Context) {
	var req struct {
		Count *int `json:"count"`
	}
	_ = c.ShouldBindJSON(&req) // body is optional
	if req.Count != nil && *req.Count <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "count must be a positive integer")
		return
	}
	result, err := wc.proxy.StopIdle(c.Request.Context(), req.Count)
	if err != nil {
		wc.writeProxyError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "stop-idle requested", result)
}

func (wc *WorkerController) RestartWorker(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "missing worker id")
		return
	}
	result, err := wc.proxy.RestartWorker(c.Request.Context(), id)
	if err != nil {
		wc.writeProxyError(c, err)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "worker restart requested", result)
}

func (wc *WorkerController) persistReplicas(c *gin.Context, replicas int) error {
	value := map[string]any{}
	if cfg, err := wc.catalog.GetSystemConfig(c.Request.Context(), runtimeConfigKey); err == nil && cfg.Value != nil {
		value = cfg.Value
	}
	value[workerReplicasField] = replicas
	_, err := wc.catalog.SetSystemConfig(c.Request.Context(), runtimeConfigKey, value)
	return err
}

func (wc *WorkerController) writeProxyError(c *gin.Context, err error) {
	var proxyErr services.WorkerProxyError
	if errors.As(err, &proxyErr) {
		switch proxyErr.StatusCode {
		case http.StatusBadRequest, http.StatusNotFound, http.StatusConflict:
			// Forward the scaler's client-side rejections faithfully.
			utils.ErrorResponse(c, proxyErr.StatusCode, http.StatusText(proxyErr.StatusCode))
			return
		}
	}
	utils.ErrorResponse(c, http.StatusBadGateway, "worker service unavailable")
}

// intFromConfig coerces a JSON-decoded config value (numbers decode to float64)
// into an int, rejecting non-integers.
func intFromConfig(value any) (int, bool) {
	switch n := value.(type) {
	case float64:
		if n != float64(int(n)) {
			return 0, false
		}
		return int(n), true
	case int:
		return n, true
	default:
		return 0, false
	}
}
