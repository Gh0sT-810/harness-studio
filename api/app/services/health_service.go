package services

import (
	"context"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
)

type DependencyPinger interface {
	Ping(context.Context) error
}

type HealthServiceInterface interface {
	Check(context.Context) models.HealthData
}

type HealthService struct {
	postgres DependencyPinger
	redis    DependencyPinger
	timeout  time.Duration
}

func NewHealthService(postgres DependencyPinger, redis DependencyPinger) HealthServiceInterface {
	return &HealthService{
		postgres: postgres,
		redis:    redis,
		timeout:  2 * time.Second,
	}
}

func (s *HealthService) Check(ctx context.Context) models.HealthData {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	checks := map[string]string{
		"postgres": "ok",
		"redis":    "ok",
	}
	status := "ok"

	if err := s.postgres.Ping(ctx); err != nil {
		checks["postgres"] = "unavailable"
		status = "unhealthy"
	}

	if err := s.redis.Ping(ctx); err != nil {
		checks["redis"] = "unavailable"
		status = "unhealthy"
	}

	return models.HealthData{
		Status: status,
		Checks: checks,
	}
}
