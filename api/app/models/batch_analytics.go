package models

type BatchAnalytics struct {
	Total      int                  `json:"total"`
	Passed     int                  `json:"passed"`
	PassRate   float64              `json:"passRate"`
	AvgSteps   float64              `json:"avgSteps"`
	ByTask     []TaskOutcome        `json:"byTask"`
	Iterations []IterationAnalytics `json:"iterations"`
}

type TaskOutcome struct {
	TaskID   string  `json:"taskId"`
	Total    int     `json:"total"`
	Passed   int     `json:"passed"`
	PassRate float64 `json:"passRate"`
}

type IterationAnalytics struct {
	ID      string  `json:"id"`
	TaskID  string  `json:"taskId"`
	Status  string  `json:"status"`
	Steps   int     `json:"steps"`
	Tokens  int64   `json:"tokens"`
	CostUSD float64 `json:"costUsd"`
}
