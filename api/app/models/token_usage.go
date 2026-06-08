package models

type UsageFilters struct {
	BatchID string `form:"batchId"`
	GymID   string `form:"gymId"`
	ModelID string `form:"modelId"`
	From    string `form:"from"`
	To      string `form:"to"`
}

type TokenUsageSummary struct {
	InputTokens  int64            `json:"inputTokens"`
	OutputTokens int64            `json:"outputTokens"`
	TotalTokens  int64            `json:"totalTokens"`
	TotalCostUSD float64          `json:"totalCostUsd"`
	Runs         int64            `json:"runs"`
	ByModel      []UsageBreakdown `json:"byModel"`
	ByGym        []UsageBreakdown `json:"byGym"`
}

type UsageBreakdown struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
	TotalTokens  int64   `json:"totalTokens"`
	TotalCostUSD float64 `json:"totalCostUsd"`
	Runs         int64   `json:"runs"`
}

type TokenUsageFilters struct {
	Batches []FilterOption `json:"batches"`
	Gyms    []FilterOption `json:"gyms"`
	Models  []FilterOption `json:"models"`
}

type FilterOption struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
