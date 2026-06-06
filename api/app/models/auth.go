package models

import "time"

type User struct {
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	DisplayName   string    `json:"displayName"`
	Role          string    `json:"role"`
	IsActive      bool      `json:"isActive"`
	IsWhitelisted bool      `json:"isWhitelisted"`
	CreatedAt     time.Time `json:"createdAt"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	User         User   `json:"user"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

type RoleUpdateRequest struct {
	Role string `json:"role" binding:"required"`
}

type DomainRequest struct {
	Domain string `json:"domain" binding:"required"`
}

type Domain struct {
	ID        string    `json:"id"`
	Domain    string    `json:"domain"`
	IsAllowed bool      `json:"isAllowed"`
	CreatedAt time.Time `json:"createdAt"`
}
