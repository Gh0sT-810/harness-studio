package models

type LeaderboardFilters struct {
	BatchID string `form:"batchId"`
	GymID   string `form:"gymId"`
	ModelID string `form:"modelId"`
	From    string `form:"from"`
	To      string `form:"to"`
}

type LeaderboardRow struct {
	ModelID        string  `json:"modelId"`
	ModelName      string  `json:"modelName"`
	GymID          string  `json:"gymId"`
	GymName        string  `json:"gymName"`
	Runs           int64   `json:"runs"`
	Passed         int64   `json:"passed"`
	Failed         int64   `json:"failed"`
	PassRate       float64 `json:"passRate"`
	AverageSteps   float64 `json:"averageSteps"`
	AverageSeconds float64 `json:"averageSeconds"`
	TotalTokens    int64   `json:"totalTokens"`
	TotalCostUSD   float64   `json:"totalCostUsd"`
	Trend          []float64 `json:"trend"`
}
