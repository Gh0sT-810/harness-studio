package services

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/repositories"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var ErrUnauthorized = errors.New("unauthorized")

type AuthStore interface {
	EnsureAdminUser(ctx context.Context, email, passwordHash string) error
	FindUserByEmail(ctx context.Context, email string) (models.User, string, error)
	FindUserByID(ctx context.Context, id string) (models.User, error)
	ListUsers(ctx context.Context) ([]models.User, error)
	UpdateUserRole(ctx context.Context, userID, role string) (models.User, error)
	SaveRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error
	RotateRefreshToken(ctx context.Context, oldHash, newHash string, expiresAt time.Time) (models.User, error)
	RevokeRefreshToken(ctx context.Context, tokenHash string) error
	CreateDomain(ctx context.Context, domain string) (models.Domain, error)
	ListDomains(ctx context.Context) ([]models.Domain, error)
	DeleteDomain(ctx context.Context, id string) error
}

type AuthServiceInterface interface {
	Bootstrap(ctx context.Context) error
	Login(ctx context.Context, req models.LoginRequest) (models.LoginResponse, error)
	Refresh(ctx context.Context, refreshToken string) (models.LoginResponse, error)
	Logout(ctx context.Context, refreshToken string) error
	CurrentUser(ctx context.Context, token string) (models.User, error)
	ListUsers(ctx context.Context) ([]models.User, error)
	UpdateUserRole(ctx context.Context, userID, role string) (models.User, error)
	CreateDomain(ctx context.Context, domain string) (models.Domain, error)
	ListDomains(ctx context.Context) ([]models.Domain, error)
	DeleteDomain(ctx context.Context, id string) error
}

type AuthService struct {
	store          AuthStore
	jwtSecret      []byte
	accessTokenTTL time.Duration
	refreshTTL     time.Duration
	adminEmail     string
	adminPassword  string
}

type Claims struct {
	UserID string `json:"sub"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func NewAuthService(store AuthStore, cfg models.Config) AuthServiceInterface {
	return &AuthService{
		store:          store,
		jwtSecret:      []byte(cfg.JWTSecret),
		accessTokenTTL: time.Duration(cfg.AccessTokenTTL) * time.Minute,
		refreshTTL:     time.Duration(cfg.RefreshTokenTTL) * time.Hour,
		adminEmail:     cfg.BootstrapAdminEmail,
		adminPassword:  cfg.BootstrapAdminPassword,
	}
}

func (s *AuthService) Bootstrap(ctx context.Context) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(s.adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash bootstrap admin password: %w", err)
	}
	return s.store.EnsureAdminUser(ctx, s.adminEmail, string(hash))
}

func (s *AuthService) Login(ctx context.Context, req models.LoginRequest) (models.LoginResponse, error) {
	user, passwordHash, err := s.store.FindUserByEmail(ctx, req.Email)
	if err != nil {
		return models.LoginResponse{}, ErrUnauthorized
	}
	if !user.IsActive || !user.IsWhitelisted {
		return models.LoginResponse{}, ErrUnauthorized
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		return models.LoginResponse{}, ErrUnauthorized
	}
	return s.issueTokens(ctx, user)
}

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (models.LoginResponse, error) {
	newRefreshToken, err := randomToken()
	if err != nil {
		return models.LoginResponse{}, err
	}
	user, err := s.store.RotateRefreshToken(ctx, repositories.HashToken(refreshToken), repositories.HashToken(newRefreshToken), time.Now().Add(s.refreshTTL))
	if err != nil {
		return models.LoginResponse{}, ErrUnauthorized
	}
	accessToken, err := s.accessToken(user)
	if err != nil {
		return models.LoginResponse{}, err
	}
	return models.LoginResponse{AccessToken: accessToken, RefreshToken: newRefreshToken, User: user}, nil
}

func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	return s.store.RevokeRefreshToken(ctx, repositories.HashToken(refreshToken))
}

func (s *AuthService) CurrentUser(ctx context.Context, token string) (models.User, error) {
	claims, err := s.parseToken(token)
	if err != nil {
		return models.User{}, ErrUnauthorized
	}
	return s.store.FindUserByID(ctx, claims.UserID)
}

func (s *AuthService) ListUsers(ctx context.Context) ([]models.User, error) {
	return s.store.ListUsers(ctx)
}

func (s *AuthService) UpdateUserRole(ctx context.Context, userID, role string) (models.User, error) {
	return s.store.UpdateUserRole(ctx, userID, role)
}

func (s *AuthService) CreateDomain(ctx context.Context, domain string) (models.Domain, error) {
	return s.store.CreateDomain(ctx, domain)
}

func (s *AuthService) ListDomains(ctx context.Context) ([]models.Domain, error) {
	return s.store.ListDomains(ctx)
}

func (s *AuthService) DeleteDomain(ctx context.Context, id string) error {
	return s.store.DeleteDomain(ctx, id)
}

func (s *AuthService) issueTokens(ctx context.Context, user models.User) (models.LoginResponse, error) {
	accessToken, err := s.accessToken(user)
	if err != nil {
		return models.LoginResponse{}, err
	}
	refreshToken, err := randomToken()
	if err != nil {
		return models.LoginResponse{}, err
	}
	if err := s.store.SaveRefreshToken(ctx, user.ID, repositories.HashToken(refreshToken), time.Now().Add(s.refreshTTL)); err != nil {
		return models.LoginResponse{}, err
	}
	return models.LoginResponse{AccessToken: accessToken, RefreshToken: refreshToken, User: user}, nil
}

func (s *AuthService) accessToken(user models.User) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			Issuer:    "harness-studio",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTokenTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.jwtSecret)
}

func (s *AuthService) parseToken(token string) (Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrUnauthorized
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return Claims{}, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return Claims{}, ErrUnauthorized
	}
	return *claims, nil
}

func randomToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
