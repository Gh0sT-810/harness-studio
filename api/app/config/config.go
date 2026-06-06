package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/joho/godotenv"
)

func LoadConfig() (*models.Config, error) {
	_ = godotenv.Load(".env")

	return &models.Config{
		ServerAddress:          ":" + env("PORT", "8080"),
		CORSOrigins:            splitCSV(env("CORS_ORIGIN", "http://localhost:3000,http://localhost:3001")),
		DBConnectionString:     env("DATABASE_URL", defaultDatabaseURL()),
		RedisAddress:           fmt.Sprintf("%s:%s", env("REDIS_HOST", "localhost"), env("REDIS_PORT", "6379")),
		JWTSecret:              env("JWT_SECRET", "local-dev-secret-change-me"),
		AccessTokenTTL:         envInt("ACCESS_TOKEN_TTL_MINUTES", 60),
		RefreshTokenTTL:        envInt("REFRESH_TOKEN_TTL_HOURS", 720),
		BootstrapAdminEmail:    env("BOOTSTRAP_ADMIN_EMAIL", "test@example.com"),
		BootstrapAdminPassword: env("BOOTSTRAP_ADMIN_PASSWORD", "Test@$1234"),
		DisableAuth:            envBool("DISABLE_AUTH", false),
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

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			values = append(values, trimmed)
		}
	}
	return values
}

func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func envBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}

	return parsed
}
