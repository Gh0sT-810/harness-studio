package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Gh0sT-810/harness-studio/api/app/events"
	"github.com/redis/go-redis/v9"
)

type EventServiceInterface interface {
	PublishBatchEvent(ctx context.Context, batchID string, event events.Envelope) (string, error)
	ReadBatchEvents(ctx context.Context, batchID, afterID string, block time.Duration) ([]events.StreamEvent, error)
}

type EventService struct {
	redis     *redis.Client
	maxLength int64
}

func NewEventService(redisClient *redis.Client) EventServiceInterface {
	return &EventService{redis: redisClient, maxLength: 1000}
}

func (s *EventService) PublishBatchEvent(ctx context.Context, batchID string, event events.Envelope) (string, error) {
	if event.Version == "" {
		event.Version = events.EnvelopeVersion
	}
	if event.BatchID == "" {
		event.BatchID = batchID
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return "", fmt.Errorf("marshal batch event: %w", err)
	}
	streamID, err := s.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: events.StreamKey(batchID),
		MaxLen: s.maxLength,
		Approx: true,
		Values: map[string]any{"event": string(payload)},
	}).Result()
	if err != nil {
		return "", fmt.Errorf("publish batch event: %w", err)
	}
	return streamID, nil
}

func (s *EventService) ReadBatchEvents(ctx context.Context, batchID, afterID string, block time.Duration) ([]events.StreamEvent, error) {
	if afterID == "" {
		afterID = "0"
	}
	streams, err := s.redis.XRead(ctx, &redis.XReadArgs{
		Streams: []string{events.StreamKey(batchID), afterID},
		Count:   25,
		Block:   block,
	}).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, fmt.Errorf("read batch events: %w", err)
	}

	var out []events.StreamEvent
	for _, stream := range streams {
		for _, message := range stream.Messages {
			raw, ok := message.Values["event"].(string)
			if !ok {
				continue
			}
			var envelope events.Envelope
			if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
				continue
			}
			envelope.Sequence = message.ID
			out = append(out, events.StreamEvent{StreamID: message.ID, Envelope: envelope})
		}
	}
	return out, nil
}
