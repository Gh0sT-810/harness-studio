package services

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
)

type mockPinger struct {
	err error
}

func (m mockPinger) Ping(context.Context) error {
	return m.err
}

func TestHealthService_Check(t *testing.T) {
	tests := []struct {
		name       string
		postgres   DependencyPinger
		redis      DependencyPinger
		wantStatus string
		wantChecks map[string]string
	}{
		{
			name:       "all dependencies ready",
			postgres:   mockPinger{},
			redis:      mockPinger{},
			wantStatus: "ok",
			wantChecks: map[string]string{
				"postgres": "ok",
				"redis":    "ok",
			},
		},
		{
			name:       "postgres fails",
			postgres:   mockPinger{err: errors.New("postgres down")},
			redis:      mockPinger{},
			wantStatus: "unhealthy",
			wantChecks: map[string]string{
				"postgres": "unavailable",
				"redis":    "ok",
			},
		},
		{
			name:       "redis fails",
			postgres:   mockPinger{},
			redis:      mockPinger{err: errors.New("redis down")},
			wantStatus: "unhealthy",
			wantChecks: map[string]string{
				"postgres": "ok",
				"redis":    "unavailable",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := NewHealthService(tt.postgres, tt.redis)

			health := service.Check(context.Background())

			assert.Equal(t, tt.wantStatus, health.Status)
			assert.Equal(t, tt.wantChecks, health.Checks)
		})
	}
}
