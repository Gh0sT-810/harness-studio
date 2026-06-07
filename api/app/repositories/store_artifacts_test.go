package repositories

import (
	"testing"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/stretchr/testify/assert"
)

func TestAttachArtifactsToIterationsUsesIterationScope(t *testing.T) {
	iterations := []models.Iteration{
		{ID: "i1"},
		{ID: "i2"},
	}
	artifacts := []models.Artifact{
		{ID: "a1", Scope: "iterations/i1", ArtifactType: "timeline"},
		{ID: "a2", Scope: "iterations/i1", ArtifactType: "screenshot"},
		{ID: "a3", Scope: "iterations/i2", ArtifactType: "log"},
	}

	attachArtifactsToIterations(iterations, artifacts)

	assert.Equal(t, []models.Artifact{artifacts[0], artifacts[1]}, iterations[0].Artifacts)
	assert.Equal(t, []models.Artifact{artifacts[2]}, iterations[1].Artifacts)
}
