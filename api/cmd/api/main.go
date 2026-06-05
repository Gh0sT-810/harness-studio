package main

import (
	"context"
	"log"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/config"
	"github.com/Gh0sT-810/harness-studio/api/app/http/routes"
	"github.com/Gh0sT-810/harness-studio/api/app/services/container"
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

	db, err := pgxpool.New(context.Background(), cfg.DBConnectionString)
	if err != nil {
		log.Fatalf("failed to create postgres pool: %v", err)
	}
	defer db.Close()

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
		AllowOrigins:     []string{cfg.CORSOrigin},
		AllowMethods:     []string{"GET", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	serviceContainer := container.NewContainer(db, redisPinger{client: redisClient})
	routes.SetupRoutes(router, serviceContainer)

	if err := router.Run(cfg.ServerAddress); err != nil {
		log.Fatalf("failed to start API server: %v", err)
	}
}
