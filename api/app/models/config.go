package models

type Config struct {
	ServerAddress          string
	CORSOrigins            []string
	DBConnectionString     string
	RedisAddress           string
	JWTSecret              string
	AccessTokenTTL         int
	RefreshTokenTTL        int
	BootstrapAdminEmail    string
	BootstrapAdminPassword string
	DisableAuth            bool
	ExecutionAPIBaseURL    string
	ExecutionDispatchTTL   int
	ArtifactServiceBaseURL string
	ArtifactServiceTTL     int
}
