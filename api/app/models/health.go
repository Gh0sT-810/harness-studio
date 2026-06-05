package models

type HealthData struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}
