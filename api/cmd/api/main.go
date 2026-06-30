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
	analyticsService := services.NewAnalyticsService(store)
	executionDispatcher := services.NewHTTPExecutionDispatcher(cfg.ExecutionAPIBaseURL, time.Duration(cfg.ExecutionDispatchTTL)*time.Second)
	executionService := services.NewExecutionService(store, eventService, executionDispatcher)
	artifactProxy := services.NewHTTPArtifactProxy(cfg.ArtifactServiceBaseURL, time.Duration(cfg.ArtifactServiceTTL)*time.Second)
	reportProxy := services.NewHTTPReportProxy(cfg.ReportServiceBaseURL, time.Duration(cfg.ReportServiceTTL)*time.Second)
	workerProxy := services.NewHTTPWorkerProxy(cfg.WorkerScalerBaseURL, time.Duration(cfg.WorkerScalerTTL)*time.Second)
	serviceContainer := container.NewContainer(pool, redisPinger{client: redisClient}, authService, catalogService, executionService, eventService, analyticsService, artifactProxy, reportProxy, workerProxy, cfg.WorkerMinReplicas, cfg.WorkerMaxReplicas)
	routes.SetupRoutes(router, serviceContainer)

	reconcileWorkerReplicas(context.Background(), catalogService, workerProxy, cfg.WorkerMinReplicas, cfg.WorkerMaxReplicas)

	if err := router.Run(cfg.ServerAddress); err != nil {
		log.Fatalf("failed to start API server: %v", err)
	}
}

// reconcileWorkerReplicas re-applies the persisted desired worker count on boot so
// the chosen scale survives a stack restart. Best-effort: any failure (no persisted
// value, scaler down) is logged and never blocks startup.
func reconcileWorkerReplicas(ctx context.Context, catalog services.CatalogServiceInterface, worker services.WorkerProxyInterface, minReplicas, maxReplicas int) {
	cfg, err := catalog.GetSystemConfig(ctx, "runtime")
	if err != nil {
		return
	}
	raw, ok := cfg.Value["workerReplicas"]
	if !ok {
		return
	}
	desired, ok := raw.(float64)
	if !ok {
		log.Printf("worker reconcile skipped: workerReplicas is not a number")
		return
	}
	replicas := int(desired)
	if replicas < minReplicas {
		replicas = minReplicas
	}
	if replicas > maxReplicas {
		replicas = maxReplicas
	}
	if _, err := worker.Scale(ctx, replicas); err != nil {
		log.Printf("worker reconcile to %d replicas failed (continuing): %v", replicas, err)
	}
}
