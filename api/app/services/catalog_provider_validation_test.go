package services

import (
	"testing"

	"github.com/Gh0sT-810/harness-studio/api/app/models"
	"github.com/stretchr/testify/assert"
)

func TestValidateModelProviderRejectsUnknownAdapterKey(t *testing.T) {
	result := validateModelProvider(models.ModelProvider{AdapterKey: "made_up_adapter"})

	assert.Equal(t, "error", result.Status)
	assert.Contains(t, result.Message, "unsupported adapter key")
}

func TestValidateModelProviderRequiresSecretForProviderBackedAdapters(t *testing.T) {
	result := validateModelProvider(models.ModelProvider{AdapterKey: "openai_responses_computer", BaseURL: "https://api.openai.com/v1"})

	assert.Equal(t, "error", result.Status)
	assert.Contains(t, result.Message, "secretRef is required")
}

func TestValidateModelProviderAcceptsMockedConnectivityForConfiguredProvider(t *testing.T) {
	result := validateModelProvider(models.ModelProvider{AdapterKey: "openai_responses_computer", BaseURL: "https://api.openai.com/v1", SecretRef: "OPENAI_API_KEY"})

	assert.Equal(t, "ok", result.Status)
	assert.Contains(t, result.Message, "mock connectivity")
}

func TestValidateModelCompatibilityRejectsGPT41ForOpenAIComputerPreview(t *testing.T) {
	result := validateModelCompatibility(
		models.ModelDefinition{ModelName: "gpt-4.1", Enabled: true},
		models.ModelProvider{AdapterKey: "openai_responses_computer", Enabled: true, SecretRef: "OPENAI_API_KEY"},
	)

	assert.Equal(t, "error", result.Status)
	assert.Contains(t, result.Message, "computer-use-preview")
}

func TestValidateModelCompatibilityAcceptsOpenAIComputerPreviewModel(t *testing.T) {
	result := validateModelCompatibility(
		models.ModelDefinition{ModelName: "computer-use-preview", Enabled: true},
		models.ModelProvider{AdapterKey: "openai_responses_computer", Enabled: true, SecretRef: "OPENAI_API_KEY"},
	)

	assert.Equal(t, "ok", result.Status)
}
