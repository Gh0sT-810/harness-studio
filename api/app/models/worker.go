package models

// WorkerStatus is the worker-execution pool view returned by the worker-scaler
// (per-worker idle/busy is merged from Flower on the scaler side). Desired is
// overlaid by the API from the persisted runtime config.
type WorkerStatus struct {
	Desired         *int         `json:"desired"`
	Actual          int          `json:"actual"`
	Total           int          `json:"total"`
	FlowerAvailable bool         `json:"flowerAvailable"`
	Workers         []WorkerInfo `json:"workers"`
}

type WorkerInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	State    string `json:"state"`    // running | exited | restarting | created | ...
	Activity string `json:"activity"` // idle | busy | unknown
}
