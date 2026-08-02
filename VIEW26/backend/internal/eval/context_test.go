package eval

import (
	"testing"

	featureagent "github.com/view26/featurelens/internal/agent"
	"github.com/view26/featurelens/internal/domain"
)

func TestRegressionPreservationBlocksNodeDroppingCandidates(t *testing.T) {
	contextAgent := featureagent.ContextAgent{}
	parent := featureagent.BaselineContext()
	input := domain.FeatureInput{Name: "Express Checkout", Slug: "express_checkout", SpecMarkdown: "# Express Checkout"}
	profile := domain.EventProfile{Rows: 5, EventOrder: []string{"express_checkout_shown"}, EventCounts: map[string]int{"express_checkout_shown": 5}}
	candidate := contextAgent.Evolve(parent, input, profile, domain.SchemaProposal{Database: "featurelens_poc", Table: "express_checkout_events_v1", Version: 1}, "trace-eval", "candidate")

	// Simulate a broken evolution that silently drops part of the parent graph.
	damaged := candidate
	damaged.Nodes = nil
	for _, node := range candidate.Nodes {
		if node.Key != "funnel:pre-purchase" {
			damaged.Nodes = append(damaged.Nodes, node)
		}
	}

	insight := domain.Insight{ContextVersion: damaged.Version, SchemaVersion: "express_checkout:v1"}
	evaluations := ContextEvolution(parent, damaged, input, profile, domain.AnalysisContract{}, insight, nil)
	for _, evaluation := range evaluations {
		if evaluation.Name != "regression_preservation" {
			continue
		}
		if evaluation.Passed {
			t.Fatalf("dropped parent node was not detected: %#v", evaluation)
		}
		if !evaluation.Blocking {
			t.Fatal("regression_preservation must be a blocking gate")
		}
		return
	}
	t.Fatal("regression_preservation gate missing")
}
