package config

import (
	"fmt"
	"os"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/joho/godotenv"
)

func LoadConfig() (*models.Config, error) {
	_ = godotenv.Load(".env")

	return &models.Config{
		ServerAddress:      ":" + env("PORT", "8080"),
		CORSOrigin:         env("CORS_ORIGIN", "http://localhost:3000"),
		DBConnectionString: env("DATABASE_URL", defaultDatabaseURL()),
		RedisAddress:       fmt.Sprintf("%s:%s", env("REDIS_HOST", "localhost"), env("REDIS_PORT", "6379")),
	}, nil
}

func defaultDatabaseURL() string {
	return "postgres://harness:harness_dev_password@localhost:5432/harness?sslmode=disable"
}

func env(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
