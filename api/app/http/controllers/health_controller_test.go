package controllers

import (
	"context"
	"net/http"
	"testing"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type mockHealthService struct {
	health models.HealthData
}

func (m mockHealthService) Check(context.Context) models.HealthData {
	return m.health
}

func setupHealthRouter(health models.HealthData) *gin.Engine {
	router := gin.New()
	controller := NewHealthController(mockHealthService{health: health})

	router.GET("/", controller.GetRoot)
	router.GET("/health", controller.GetHealth)

	return router
}

func TestHealthController_GetHealth(t *testing.T) {
	tests := []struct {
		name       string
		health     models.HealthData
		wantStatus int
		wantOK     bool
	}{
		{
			name: "dependencies ready",
			health: models.HealthData{
				Status: "ok",
				Checks: map[string]string{
					"postgres": "ok",
					"redis":    "ok",
				},
			},
			wantStatus: http.StatusOK,
			wantOK:     true,
		},
		{
			name: "postgres unavailable",
			health: models.HealthData{
				Status: "unhealthy",
				Checks: map[string]string{
					"postgres": "unavailable",
					"redis":    "ok",
				},
			},
			wantStatus: http.StatusServiceUnavailable,
			wantOK:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := setupHealthRouter(tt.health)

			w := performRequest(router, http.MethodGet, "/health", nil)

			assert.Equal(t, tt.wantStatus, w.Code)
			resp := parseResponse(w)
			assert.Equal(t, tt.wantOK, resp.Success)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestHealthController_GetRoot(t *testing.T) {
	router := setupHealthRouter(models.HealthData{Status: "ok"})

	w := performRequest(router, http.MethodGet, "/", nil)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponse(w)
	assert.True(t, resp.Success)
	assert.Equal(t, "harness api ready", resp.Message)
}
