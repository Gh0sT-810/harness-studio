package main

import (
	"context"
	"log"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/config"
	"github.com/Gh0sT-810/harness-studio/api/app/http/routes"
	"github.com/Gh0sT-810/harness-studio/api/app/repositories"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/services/container"
	"github.com/Gh0sT-810/harness-studio/api/db"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type redisPinger struct {
	client *redis.Client
}

func (p redisPinger) Ping(ctx context.Context) error {
	return p.client.Ping(ctx).Err()
}

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("failed to load configuration: %v", err)
	}

	pool, err := pgxpool.New(context.Background(), cfg.DBConnectionString)
	if err != nil {
		log.Fatalf("failed to create postgres pool: %v", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(context.Background(), pool); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	redisClient := redis.NewClient(&redis.Options{Addr: cfg.RedisAddress})
	defer func() {
		if err := redisClient.Close(); err != nil {
			log.Printf("failed to close redis client: %v", err)
		}
	}()

	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Last-Event-ID"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	store := repositories.NewStore(pool)
	authService := services.NewAuthService(store, *cfg)
	if err := authService.Bootstrap(context.Background()); err != nil {
		log.Fatalf("failed to bootstrap auth: %v", err)
	}
	catalogService := services.NewCatalogService(store)
	eventService := services.NewEventService(redisClient)
	executionDispatcher := services.NewHTTPExecutionDispatcher(cfg.ExecutionAPIBaseURL, time.Duration(cfg.ExecutionDispatchTTL)*time.Second)
	executionService := services.NewExecutionService(store, eventService, executionDispatcher)
	artifactProxy := services.NewHTTPArtifactProxy(cfg.ArtifactServiceBaseURL, time.Duration(cfg.ArtifactServiceTTL)*time.Second)
	serviceContainer := container.NewContainer(pool, redisPinger{client: redisClient}, authService, catalogService, executionService, eventService, artifactProxy)
	routes.SetupRoutes(router, serviceContainer)

	if err := router.Run(cfg.ServerAddress); err != nil {
		log.Fatalf("failed to start API server: %v", err)
	}
}
