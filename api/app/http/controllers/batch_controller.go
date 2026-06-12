package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/events"
	"github.com/Gh0sT-810/harness-studio/api/app/http/middleware"
	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/Gh0sT-810/harness-studio/api/app/utils"
	"github.com/gin-gonic/gin"
)

type BatchController struct {
	executionService services.ExecutionServiceInterface
	eventService     services.EventServiceInterface
}

func NewBatchController(executionService services.ExecutionServiceInterface, eventService services.EventServiceInterface) *BatchController {
	return &BatchController{executionService: executionService, eventService: eventService}
}

func (bc *BatchController) CreateBatch(c *gin.Context) {
	var req models.BatchCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "invalid batch request")
		return
	}
	user, _ := middleware.CurrentUser(c)
	batch, err := bc.executionService.CreateBatch(c.Request.Context(), req, user.ID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "create batch failed")
		return
	}
	utils.SuccessResponse(c, http.StatusCreated, "batch created", batch)
}

func (bc *BatchController) ListBatches(c *gin.Context) {
	batches, err := bc.executionService.ListBatches(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "list batches failed")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "batches retrieved", batches)
}

func (bc *BatchController) GetBatchSnapshot(c *gin.Context) {
	snapshot, err := bc.executionService.GetBatchSnapshot(c.Request.Context(), c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "batch snapshot not found")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "batch snapshot retrieved", snapshot)
}

func (bc *BatchController) CancelBatch(c *gin.Context) {
	if err := bc.executionService.CancelBatch(c.Request.Context(), c.Param("id")); err != nil {
		utils.ErrorResponse(c, http.StatusBadGateway, "cancel batch failed")
		return
	}
	utils.SuccessResponse(c, http.StatusAccepted, "batch cancellation requested", map[string]string{"id": c.Param("id")})
}

func (bc *BatchController) StreamBatchEvents(c *gin.Context) {
	if bc.eventService == nil {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "event service unavailable")
		return
	}

	batchID := c.Param("id")
	lastID := c.GetHeader("Last-Event-ID")
	if lastID == "" {
		lastID = c.Query("last_event_id")
	}
	if lastID == "" {
		lastID = "0"
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		return
	}
	flusher.Flush()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-heartbeat.C:
			_, _ = fmt.Fprint(c.Writer, ": heartbeat\n\n")
			flusher.Flush()
			continue
		default:
		}

		streamEvents, err := bc.eventService.ReadBatchEvents(c.Request.Context(), batchID, lastID, 10*time.Second)
		if err != nil {
			envelope := events.NewEnvelope(events.TypeSnapshotRequired, batchID, map[string]any{"reason": "stream_error"})
			payload, marshalErr := json.Marshal(envelope)
			if marshalErr != nil {
				return
			}
			_, _ = fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", envelope.Type, payload)
			flusher.Flush()
			return
		}
		for _, event := range streamEvents {
			lastID = event.StreamID
			payload, err := json.Marshal(event.Envelope)
			if err != nil {
				continue
			}
			_, _ = fmt.Fprintf(c.Writer, "id: %s\nevent: %s\ndata: %s\n\n", event.StreamID, event.Envelope.Type, payload)
			flusher.Flush()
		}
	}
}
