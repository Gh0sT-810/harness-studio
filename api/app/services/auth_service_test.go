package services

import (
	"context"
	"testing"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

type fakeAuthStore struct {
	user         models.User
	passwordHash string
	savedToken   string
}

func (f *fakeAuthStore) EnsureAdminUser(context.Context, string, string) error { return nil }
func (f *fakeAuthStore) FindUserByEmail(context.Context, string) (models.User, string, error) {
	return f.user, f.passwordHash, nil
}
func (f *fakeAuthStore) FindUserByID(context.Context, string) (models.User, error) {
	return f.user, nil
}
func (f *fakeAuthStore) ListUsers(context.Context) ([]models.User, error) {
	return []models.User{f.user}, nil
}
func (f *fakeAuthStore) UpdateUserRole(context.Context, string, string) (models.User, error) {
	return f.user, nil
}
func (f *fakeAuthStore) SaveRefreshToken(_ context.Context, _ string, tokenHash string, _ time.Time) error {
	f.savedToken = tokenHash
	return nil
}
func (f *fakeAuthStore) RotateRefreshToken(context.Context, string, string, time.Time) (models.User, error) {
	return f.user, nil
}
func (f *fakeAuthStore) RevokeRefreshToken(context.Context, string) error { return nil }
func (f *fakeAuthStore) CreateDomain(context.Context, string) (models.Domain, error) {
	return models.Domain{}, nil
}
func (f *fakeAuthStore) ListDomains(context.Context) ([]models.Domain, error) { return nil, nil }
func (f *fakeAuthStore) DeleteDomain(context.Context, string) error           { return nil }

func TestAuthService_Login(t *testing.T) {
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("Test@$1234"), bcrypt.MinCost)
	require.NoError(t, err)

	store := &fakeAuthStore{
		user: models.User{
			ID:            "user-1",
			Email:         "test@example.com",
			Role:          "admin",
			IsActive:      true,
			IsWhitelisted: true,
		},
		passwordHash: string(passwordHash),
	}
	service := NewAuthService(store, models.Config{
		JWTSecret:       "test-secret",
		AccessTokenTTL:  60,
		RefreshTokenTTL: 720,
	})

	resp, err := service.Login(context.Background(), models.LoginRequest{
		Email:    "test@example.com",
		Password: "Test@$1234",
	})

	require.NoError(t, err)
	assert.NotEmpty(t, resp.AccessToken)
	assert.NotEmpty(t, resp.RefreshToken)
	assert.NotEmpty(t, store.savedToken)
	assert.Equal(t, "admin", resp.User.Role)
}

func TestAuthService_LoginRejectsBadPassword(t *testing.T) {
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("Test@$1234"), bcrypt.MinCost)
	require.NoError(t, err)

	store := &fakeAuthStore{
		user: models.User{
			ID:            "user-1",
			Email:         "test@example.com",
			Role:          "admin",
			IsActive:      true,
			IsWhitelisted: true,
		},
		passwordHash: string(passwordHash),
	}
	service := NewAuthService(store, models.Config{JWTSecret: "test-secret", AccessTokenTTL: 60, RefreshTokenTTL: 720})

	_, err = service.Login(context.Background(), models.LoginRequest{
		Email:    "test@example.com",
		Password: "wrong",
	})

	assert.ErrorIs(t, err, ErrUnauthorized)
}
