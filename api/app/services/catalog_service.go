package services

import (
	"context"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
)

type CatalogStore interface {
	CreateGym(ctx context.Context, req models.GymRequest) (models.Gym, error)
	ListGyms(ctx context.Context) ([]models.Gym, error)
	GetGym(ctx context.Context, id string) (models.Gym, error)
	UpdateGym(ctx context.Context, id string, req models.GymRequest) (models.Gym, error)
	DeleteGym(ctx context.Context, id string) error
	CreateTask(ctx context.Context, req models.TaskRequest) (models.Task, error)
	ListTasks(ctx context.Context) ([]models.Task, error)
	GetTask(ctx context.Context, id string) (models.Task, error)
	UpdateTask(ctx context.Context, id string, req models.TaskRequest) (models.Task, error)
	DeleteTask(ctx context.Context, id string) error
	ListModelProviders(ctx context.Context) ([]models.ModelProvider, error)
	ListModelDefinitions(ctx context.Context) ([]models.ModelDefinition, error)
}

type CatalogServiceInterface interface {
	CreateGym(ctx context.Context, req models.GymRequest) (models.Gym, error)
	ListGyms(ctx context.Context) ([]models.Gym, error)
	GetGym(ctx context.Context, id string) (models.Gym, error)
	UpdateGym(ctx context.Context, id string, req models.GymRequest) (models.Gym, error)
	DeleteGym(ctx context.Context, id string) error
	CreateTask(ctx context.Context, req models.TaskRequest) (models.Task, error)
	ListTasks(ctx context.Context) ([]models.Task, error)
	GetTask(ctx context.Context, id string) (models.Task, error)
	UpdateTask(ctx context.Context, id string, req models.TaskRequest) (models.Task, error)
	DeleteTask(ctx context.Context, id string) error
	ListModelProviders(ctx context.Context) ([]models.ModelProvider, error)
	ListModelDefinitions(ctx context.Context) ([]models.ModelDefinition, error)
}

type CatalogService struct {
	store CatalogStore
}

func NewCatalogService(store CatalogStore) CatalogServiceInterface {
	return &CatalogService{store: store}
}

func (s *CatalogService) CreateGym(ctx context.Context, req models.GymRequest) (models.Gym, error) {
	return s.store.CreateGym(ctx, req)
}

func (s *CatalogService) ListGyms(ctx context.Context) ([]models.Gym, error) {
	return s.store.ListGyms(ctx)
}

func (s *CatalogService) GetGym(ctx context.Context, id string) (models.Gym, error) {
	return s.store.GetGym(ctx, id)
}

func (s *CatalogService) UpdateGym(ctx context.Context, id string, req models.GymRequest) (models.Gym, error) {
	return s.store.UpdateGym(ctx, id, req)
}

func (s *CatalogService) DeleteGym(ctx context.Context, id string) error {
	return s.store.DeleteGym(ctx, id)
}

func (s *CatalogService) CreateTask(ctx context.Context, req models.TaskRequest) (models.Task, error) {
	return s.store.CreateTask(ctx, req)
}

func (s *CatalogService) ListTasks(ctx context.Context) ([]models.Task, error) {
	return s.store.ListTasks(ctx)
}

func (s *CatalogService) GetTask(ctx context.Context, id string) (models.Task, error) {
	return s.store.GetTask(ctx, id)
}

func (s *CatalogService) UpdateTask(ctx context.Context, id string, req models.TaskRequest) (models.Task, error) {
	return s.store.UpdateTask(ctx, id, req)
}

func (s *CatalogService) DeleteTask(ctx context.Context, id string) error {
	return s.store.DeleteTask(ctx, id)
}

func (s *CatalogService) ListModelProviders(ctx context.Context) ([]models.ModelProvider, error) {
	return s.store.ListModelProviders(ctx)
}

func (s *CatalogService) ListModelDefinitions(ctx context.Context) ([]models.ModelDefinition, error) {
	return s.store.ListModelDefinitions(ctx)
}
