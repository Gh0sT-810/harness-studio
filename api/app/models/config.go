package models

type Config struct {
	ServerAddress          string
	CORSOrigin             string
	DBConnectionString     string
	RedisAddress           string
	JWTSecret              string
	AccessTokenTTL         int
	RefreshTokenTTL        int
	BootstrapAdminEmail    string
	BootstrapAdminPassword string
	DisableAuth            bool
}
