package services

import (
	"context"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
)

type AnalyticsStore interface {
	GetTokenUsageSummary(ctx context.Context, filters models.UsageFilters) (models.TokenUsageSummary, error)
	GetTokenUsageFilters(ctx context.Context) (models.TokenUsageFilters, error)
	ExportTokenUsageCSV(ctx context.Context, filters models.UsageFilters) ([]byte, error)
	GetLeaderboard(ctx context.Context, filters models.LeaderboardFilters) ([]models.LeaderboardRow, error)
}

type AnalyticsServiceInterface interface {
	GetTokenUsageSummary(ctx context.Context, filters models.UsageFilters) (models.TokenUsageSummary, error)
	GetTokenUsageFilters(ctx context.Context) (models.TokenUsageFilters, error)
	ExportTokenUsageCSV(ctx context.Context, filters models.UsageFilters) ([]byte, error)
	GetLeaderboard(ctx context.Context, filters models.LeaderboardFilters) ([]models.LeaderboardRow, error)
}

type AnalyticsService struct {
	store AnalyticsStore
}

func NewAnalyticsService(store AnalyticsStore) AnalyticsServiceInterface {
	return &AnalyticsService{store: store}
}

func (s *AnalyticsService) GetTokenUsageSummary(ctx context.Context, filters models.UsageFilters) (models.TokenUsageSummary, error) {
	return s.store.GetTokenUsageSummary(ctx, filters)
}

func (s *AnalyticsService) GetTokenUsageFilters(ctx context.Context) (models.TokenUsageFilters, error) {
	return s.store.GetTokenUsageFilters(ctx)
}

func (s *AnalyticsService) ExportTokenUsageCSV(ctx context.Context, filters models.UsageFilters) ([]byte, error) {
	return s.store.ExportTokenUsageCSV(ctx, filters)
}

func (s *AnalyticsService) GetLeaderboard(ctx context.Context, filters models.LeaderboardFilters) ([]models.LeaderboardRow, error) {
	return s.store.GetLeaderboard(ctx, filters)
}
