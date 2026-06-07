package controllers

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/Gh0sT-810/harness-studio/api/app/services"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type mockArtifactProxy struct {
	listBody    []byte
	listType    string
	artifact    map[string][]byte
	contentType map[string]string
	err         error
}

func (m mockArtifactProxy) ListScope(context.Context, string) ([]byte, string, error) {
	return m.listBody, m.listType, m.err
}

func (m mockArtifactProxy) GetArtifact(_ context.Context, artifactID string) ([]byte, string, error) {
	if m.err != nil {
		return nil, "", m.err
	}
	return m.artifact[artifactID], m.contentType[artifactID], nil
}

func (m mockArtifactProxy) GetArtifactMetadata(context.Context, string) ([]byte, string, error) {
	return nil, "", m.err
}

func (m mockArtifactProxy) ArchiveScope(context.Context, string) ([]byte, string, error) {
	return nil, "", m.err
}

func (m mockArtifactProxy) ArchiveBatch(context.Context, string) ([]byte, string, error) {
	return nil, "", m.err
}

func setupArtifactRouter(proxy services.ArtifactProxyInterface) *gin.Engine {
	router := gin.New()
	controller := NewArtifactController(proxy)
	router.GET("/iterations/:id/timeline", controller.GetIterationTimeline)
	router.GET("/iterations/:id/screenshot", controller.GetIterationScreenshot)
	router.GET("/artifacts/:id", controller.GetArtifact)
	return router
}

func TestArtifactControllerReturnsTimelineDocument(t *testing.T) {
	router := setupArtifactRouter(mockArtifactProxy{
		listBody: []byte(`[
			{"id":"before-1","artifactType":"screenshot","metadata":{"timelineKind":"before"}},
			{"id":"timeline-1","artifactType":"timeline","metadata":{"filename":"action_timeline.json"}}
		]`),
		listType: "application/json",
		artifact: map[string][]byte{
			"timeline-1": []byte(`{"version":"v1","iterationId":"i1","steps":[]}`),
		},
		contentType: map[string]string{"timeline-1": "application/json"},
	})

	w := performRequest(router, http.MethodGet, "/iterations/i1/timeline", nil)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
	assert.JSONEq(t, `{"version":"v1","iterationId":"i1","steps":[]}`, w.Body.String())
}

func TestArtifactControllerReturnsAfterScreenshotByDefault(t *testing.T) {
	router := setupArtifactRouter(mockArtifactProxy{
		listBody: []byte(`[
			{"id":"before-1","artifactType":"screenshot","metadata":{"timelineKind":"before"}},
			{"id":"after-1","artifactType":"screenshot","metadata":{"timelineKind":"after"}}
		]`),
		listType: "application/json",
		artifact: map[string][]byte{
			"before-1": []byte("before"),
			"after-1":  []byte("after"),
		},
		contentType: map[string]string{"after-1": "image/png"},
	})

	w := performRequest(router, http.MethodGet, "/iterations/i1/screenshot", nil)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "image/png", w.Header().Get("Content-Type"))
	assert.Equal(t, "after", w.Body.String())
}

func TestArtifactControllerMapsArtifactProxyNotFound(t *testing.T) {
	router := setupArtifactRouter(mockArtifactProxy{err: services.ArtifactProxyError{StatusCode: http.StatusNotFound}})

	w := performRequest(router, http.MethodGet, "/artifacts/missing", nil)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestArtifactControllerMapsGenericArtifactProxyErrorToBadGateway(t *testing.T) {
	router := setupArtifactRouter(mockArtifactProxy{err: errors.New("network down")})

	w := performRequest(router, http.MethodGet, "/artifacts/a1", nil)

	assert.Equal(t, http.StatusBadGateway, w.Code)
}
