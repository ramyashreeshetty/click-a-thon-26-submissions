"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ContextGraph from "./context-graph";
import { Chart, type AnalyticsChart } from "./charts";

const API = process.env.NEXT_PUBLIC_FEATURELENS_API ?? "http://localhost:8080";
const LIBRECHAT_URL = process.env.NEXT_PUBLIC_LIBRECHAT_URL ?? "";

function powerChatURL() {
  if (LIBRECHAT_URL) return LIBRECHAT_URL;
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://localhost:3080";
  }
  return "";
}

type View = "ask" | "decisions" | "releases" | "pipeline" | "context" | "trace";
type RuntimeStatus = { enabled: boolean; model?: string; prompt_version?: string; provider?: string };
type EventPreflight = { rows: number; eventTypes: string[]; fields: number; firstEvent: string; lastEvent: string };
type UploadFile = { name: string; size: number; text: string };
type RunEvent = { run_id: string; stage: string; message: string; timestamp: string };

type AnalysisTraceStep = {
  id: string;
  observation_id?: string;
  kind: string;
  status: string;
  duration_ms: number;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
};

type AnalysisTrace = {
  trace_id: string;
  role: string;
  feature: string;
  question: string;
  context_version: number;
  schema_version: string;
  dataset_rows: number;
  steps: AnalysisTraceStep[];
};

type LangfuseObservation = {
  id: string;
  trace_id: string;
  parent_observation_id?: string;
  name?: string;
  type?: string;
  level?: string;
  status_message?: string;
  version?: string;
  environment?: string;
  start_time?: string;
  end_time?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  model?: string;
  usage?: Record<string, unknown>;
  cost?: number;
  latency?: number;
  trace_name?: string;
  tags?: string[];
  release?: string;
};

type LangfuseScore = {
  id: string;
  name: string;
  value: unknown;
  data_type: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT" | "CORRECTION";
  source: "API" | "ANNOTATION" | "EVAL";
  timestamp?: string;
  comment?: string;
  author_user_id?: string;
  subject: { kind: "trace" | "observation" | "session" | "experiment"; id: string; trace_id?: string };
};

type LangfuseTraceInsights = {
  enabled: boolean;
  status: "disabled" | "pending" | "synced";
  trace_id: string;
  url?: string;
  observations: LangfuseObservation[];
  scores: LangfuseScore[];
  summary: { observation_count: number; score_count: number; generation_count: number; total_cost: number; total_tokens: number; latency: number };
};

type Insight = {
  headline: string;
  summary: string;
  why: string;
  confidence: number;
  recommended_action: string;
  sql?: string;
  trace_id?: string;
  provenance?: { generator: string; provider?: string; model?: string; prompt_version: string };
  trace?: AnalysisTrace;
};

type Contract = {
  feature: string;
  role: string;
  playbook: string;
  answerability: string;
  context_version: number;
  schema_versions: string[];
  limitations?: string[];
};

type AnalyticsKPI = {
  key: string;
  label: string;
  formatted_value: string;
  confidence: number;
  sample_size?: number;
  source_playbook?: string;
};
type ReleaseKPI = AnalyticsKPI & { evidence_label: string };
type RankedInsight = { rank: number; headline: string; summary: string; recommended_action: string; confidence: number; playbook: string };
type FeatureAnalyticsBundle = {
  feature: string;
  status: string;
  context_version: number;
  schema_version: string;
  kpis: AnalyticsKPI[];
  charts: AnalyticsChart[];
  insights: RankedInsight[];
  playbooks: string[];
  limitations?: string[];
};

type Run = {
  id: string;
  stage: string;
  execution_mode: string;
  input?: { name: string; schema_version?: number; use_existing_data?: boolean };
  trace_id?: string;
  error?: string;
  profile?: { rows: number; event_counts: Record<string, number>; fields: { path: string }[] };
  schema?: {
    version: number;
    database: string;
    table: string;
    ddl: string;
    status: string;
    partition_by: string;
    order_by: string[];
  };
  validation?: { passed: boolean; checks: { name: string; passed: boolean; details: string }[] };
  context?: {
    version: number;
    parent_version: number;
    feature: string;
    summary: string;
    state: string;
    schema_versions: string[];
    nodes: { key: string; type: string; name: string; status: string; confidence: number; properties?: Record<string, unknown> }[];
    edges: { from: string; relation: string; to: string }[];
    conflicts: { key: string; severity: string; description: string; status: string }[];
  };
  insight?: Insight;
  analysis_contract?: Contract;
  analytics_bundle?: FeatureAnalyticsBundle;
  created_at?: string;
  updated_at?: string;
};

type ConversationResponse = {
  resolved_question: string;
  feature_scope: string[];
  context_version: number;
  mode: "dashboard" | "single";
  contract: Contract;
  insight: Insight;
  kpis?: AnalyticsKPI[];
  charts: AnalyticsChart[];
  sources: { contract: Contract; insight: Insight }[];
  follow_up_prompts: string[];
};

type ConversationTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  featureScope?: string[];
  response?: ConversationResponse;
};

type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: ConversationTurn[];
};

type CatalogTable = {
  database: string;
  name: string;
  category: "source" | "agent_created" | "governance" | "supporting";
  engine: string;
  rows: number;
  context_registered: boolean;
};

type DataCatalog = { source_database: string; control_database: string; tables: CatalogTable[] };

const featurePackages = [
  {
    id: "express",
    order: "01",
    name: "Express Checkout",
    schemaVersion: 1,
    rows: "5,507",
    outcome: "Conversion lift · OTP friction · time to pay",
    description: "One-tap checkout for returning travellers using a saved payment method and OTP.",
    spec: "# Express Checkout\n\nOne-tap checkout for returning travellers.\n\n## Product questions\n- Does Express lift checkout completion?\n- Where does OTP or payment fail?\n- Which cities and devices perform best?",
  },
  {
    id: "group",
    order: "02",
    name: "Group / Family",
    schemaVersion: 2,
    rows: "4,412",
    outcome: "Group creation · member completion · payment conversion",
    description: "Coordinate multi-traveller applications and shared payment completion.",
    spec: "# Group / Family\n\nCoordinate multi-traveller applications.\n\n## Product questions\n- Where do groups drop before payment?\n- Which group sizes complete best?",
  },
  {
    id: "sharing",
    order: "03",
    name: "Status Sharing",
    schemaVersion: 2,
    rows: "3,108",
    outcome: "Share adoption · recipient engagement · support deflection",
    description: "Share a live visa application status with trusted recipients.",
    spec: "# Status Sharing\n\nShare live application status.\n\n## Product questions\n- Who shares and who engages?\n- Does sharing reduce support demand?",
  },
  {
    id: "recovery",
    order: "04",
    name: "Abandoned Checkout Recovery",
    schemaVersion: 2,
    rows: "4,902",
    outcome: "Recovery reach · resumed checkout · recovered revenue",
    description: "Bring travellers back after they leave an incomplete checkout.",
    spec: "# Abandoned Checkout Recovery\n\nRecover incomplete checkout journeys.\n\n## Product questions\n- Which channels recover the most users?\n- How much revenue is recovered?",
  },
  {
    id: "forex",
    order: "05",
    name: "Instant Forex",
    schemaVersion: 2,
    rows: "3,955",
    outcome: "Quote adoption · price certainty · currency-pair performance",
    description: "Show and lock a local-currency visa price before purchase.",
    spec: "# Instant Forex\n\nShow and lock a local-currency price.\n\n## Product questions\n- Does price certainty improve completion?\n- Which currency pairs have strongest adoption?",
  },
] as const;

type FeatureID = (typeof featurePackages)[number]["id"] | "unseen" | `custom:${string}`;

const stageOrder = ["received", "profiling", "schema_proposed", "awaiting_approval", "schema_verified", "context_published", "analytics_complete", "completed"];
const fallbackStarterPrompts = [
  "Which cities and devices show the strongest Express Checkout completion, and how wide is the gap between segments?",
  "Which published feature has the highest end-to-end completion rate, and which one is lagging furthest behind?",
  "Where is the largest mobile or OS performance gap, and how much completion is it costing us?",
];

// PM-voiced expansions of each question intent. The wording is deliberate:
// the conversation endpoint re-classifies submitted text with the same keyword
// rules the Context Agent used (ClassifyIntent / recoveryIntent), so every
// template keeps its intent's trigger words while framing the decision a PM
// actually has to make.
const pmPromptByIntent: Record<string, (feature: string) => string> = {
  conversion_comparison: (feature) => `Is ${feature} actually lifting end-to-end conversion versus the standard flow, and how many percentage points is it worth?`,
  platform_failure: (feature) => `Where are ${feature} users failing at OTP or payment, and which device and OS cohorts should engineering prioritise first?`,
  completion_trend: (feature) => `How has ${feature} completion trended week over week since launch — is momentum building or flattening out?`,
  segment_comparison: (feature) => `Which cities and devices show the strongest ${feature} completion, and how wide is the gap between the best and weakest segments?`,
  feature_adoption: (feature) => `Which traveller segments are adopting ${feature} the most, and where is adoption still lagging behind?`,
  funnel_diagnosis: (feature) => `Where in the ${feature} funnel are we losing the most users before payment, and which drop should we fix first?`,
  latency_performance: (feature) => `Is ${feature} actually faster for returning travellers, and how much time does it save at checkout?`,
  customer_geography: (feature) => `Where are our ${feature} customers coming from — which cities and locations drive the most volume?`,
  group_size_completion: (feature) => `Which group sizes complete best for ${feature}, and where do larger groups fall off before payment?`,
  group_traveller_churn: (feature) => `How often are travellers removed from ${feature} applications before completion, and what is that churn costing us?`,
  group_document_bottleneck: (feature) => `Is document completion the biggest bottleneck for ${feature} groups, and which step stalls them the longest?`,
  group_segments: (feature) => `Which destinations drive the most group demand for ${feature}, and how do those segments differ in completion?`,
  recovery_channel: (feature) => `Which channels recover the most abandoned checkouts for ${feature}, and how strong is their open → click follow-through?`,
  recovery_timing: (feature) => `Which reminder timing recovers the most ${feature} checkouts — within 1h, 24h, or 48h of drop-off?`,
  recovery_drop_step: (feature) => `Which checkout step is the largest recoverable revenue opportunity for ${feature}?`,
  recovery_segments: (feature) => `Which device and geo segments respond best to ${feature} outreach, and where is it wasted?`,
};

// The Context Agent publishes each feature's spec questions as business_question
// nodes (key "question:<feature-slug>:<n>") carrying their classified intent, so
// the welcome prompts can be generated from the latest published context instead
// of a hardcoded list.
function starterPromptsFromContext(context: Run["context"] | null): string[] {
  const nodes = context?.nodes ?? [];
  const questions = nodes.filter((node) => node.type === "business_question");
  if (questions.length === 0) return fallbackStarterPrompts;
  const featureNames = new Map(nodes.filter((node) => node.type === "feature").map((node) => [node.key.replace("feature:", ""), node.name]));
  const byFeature = new Map<string, string[]>();
  for (const node of questions) {
    const slug = node.key.split(":")[1] ?? node.key;
    const feature = featureNames.get(slug) ?? slug.replaceAll(/[_-]/g, " ");
    const intent = typeof node.properties?.intent === "string" ? node.properties.intent : "";
    const prompt = pmPromptByIntent[intent]?.(feature) ?? node.name;
    byFeature.set(slug, [...(byFeature.get(slug) ?? []), prompt]);
  }
  const groups = [...byFeature.values()];
  const picked = new Set<string>();
  for (let round = 0; picked.size < 4; round++) {
    const before = picked.size;
    for (const group of groups) {
      if (round < group.length && picked.size < 4) picked.add(group[round]);
    }
    if (picked.size === before) break;
  }
  return [...picked];
}
const knownFeatureNames = new Set(featurePackages.map((item) => item.name.toLowerCase()));
const maxIntakeBytes = 15 * 1024 * 1024;

function normalize(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function customFeatureID(run: Pick<Run, "id">): FeatureID {
  return `custom:${run.id}`;
}

function featureSelectionForRun(run: Run): FeatureID {
  return featurePackages.find((feature) => normalize(feature.name) === normalize(run.input?.name))?.id ?? customFeatureID(run);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const chatStorageKey = "featurelens.chats.v1";

function createChat(): Chat {
  const now = Date.now();
  return { id: `chat-${now}-${Math.random().toString(36).slice(2, 8)}`, title: "New chat", createdAt: now, updatedAt: now, turns: [] };
}

function chatTitleFrom(question: string) {
  const clean = question.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
}

function loadStoredChats(): Chat[] {
  try {
    const raw = window.localStorage.getItem(chatStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Chat[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((chat) => chat && typeof chat.id === "string" && typeof chat.title === "string" && Array.isArray(chat.turns));
  } catch {
    return [];
  }
}

function compactID(value?: string) {
  if (!value) return "pending";
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-5)}` : value;
}

function inspectNDJSON(text: string): EventPreflight {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("Event file is empty");
  const eventTypes = new Set<string>();
  const fields = new Set<string>();
  const events: string[] = [];
  lines.forEach((line, index) => {
    let row: Record<string, unknown>;
    try { row = JSON.parse(line) as Record<string, unknown>; } catch { throw new Error(`Line ${index + 1} is not valid JSON`); }
    const event = row.event ?? row.event_name;
    if (typeof event !== "string" || !event.trim()) throw new Error(`Line ${index + 1} needs event or event_name`);
    if (!row.timestamp) throw new Error(`Line ${index + 1} needs timestamp`);
    eventTypes.add(event);
    events.push(event);
    Object.keys(row).forEach((field) => fields.add(field));
  });
  return { rows: lines.length, eventTypes: [...eventTypes], fields: fields.size, firstEvent: events[0], lastEvent: events.at(-1) ?? events[0] };
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`fl-brand-mark ${compact ? "compact" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>;
}

function sentenceCase(value: string) {
  const clean = value.replaceAll("_", " ").replace(/\s+/g, " ").trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : clean;
}

function uniqueSegmentLabel(value: string) {
  const values = value.split("/").map((item) => item.trim()).filter(Boolean);
  return values.filter((item, index) => values.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index).join(" / ");
}

function compactFunnelStage(stage: string, feature: string) {
  const featureWords = new Set(feature.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const stageWords = stage.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const compact = stageWords.filter((word) => !featureWords.has(word));
  return sentenceCase((compact.length > 0 ? compact : stageWords).join(" "));
}

function releaseDecisionKPIs(bundle: FeatureAnalyticsBundle): ReleaseKPI[] {
  const byKey = new Map(bundle.kpis.map((kpi) => [kpi.key, { ...kpi }]));
  const funnel = bundle.charts.find((chart) => chart.key === "feature_funnel")?.series[0]?.points ?? [];
  let largestLoss: { from: string; to: string; rate: number; sample: number } | undefined;
  for (let index = 1; index < funnel.length; index++) {
    const previous = funnel[index - 1];
    const current = funnel[index];
    if (previous.value <= 0) continue;
    const rate = Math.max(0, (previous.value - current.value) / previous.value);
    if (!largestLoss || rate > largestLoss.rate) largestLoss = { from: previous.label, to: current.label, rate, sample: previous.value };
  }
  if (largestLoss) {
    const existing = byKey.get("largest_funnel_loss");
    byKey.set("largest_funnel_loss", {
      key: "largest_funnel_loss",
      label: `Largest drop-off · ${compactFunnelStage(largestLoss.from, bundle.feature)} → ${compactFunnelStage(largestLoss.to, bundle.feature)}`,
      formatted_value: `${(largestLoss.rate * 100).toFixed(1)}%`,
      confidence: existing?.confidence ?? .95,
      sample_size: existing?.sample_size ?? largestLoss.sample,
      source_playbook: existing?.source_playbook,
    });
  }

  const segmentChart = bundle.charts.find((chart) => chart.key === "segment_completion");
  const preferredDimension = bundle.playbooks.some((playbook) => playbook.includes("instant-forex")) ? ["destination", "target_currency", "to_currency", "city", "device_type"] : ["city", "device_type", "os"];
  const segmentSeries = preferredDimension.map((key) => segmentChart?.series.find((series) => series.key === key)).find(Boolean) ?? segmentChart?.series[0];
  if (segmentSeries?.points.length) {
    const strongest = segmentSeries.points.reduce((highest, point) => point.value > highest.value ? point : highest);
    byKey.set("strongest_segment", {
      key: "strongest_segment",
      label: `Strongest ${sentenceCase(segmentSeries.label).toLowerCase()} · ${sentenceCase(strongest.label)}`,
      formatted_value: `${strongest.value.toFixed(1)}%`,
      confidence: .9,
      sample_size: strongest.sample_size,
      source_playbook: "dashboard:feature-segments:v1",
    });
  }

  const dashboard = bundle.playbooks.find((playbook) => playbook.startsWith("dashboard:") && !playbook.includes("completion-trend") && !playbook.includes("feature-segments")) ?? "";
  const priority = dashboard.includes("express-checkout")
    ? ["lift_vs_standard", "weakest_otp_segment", "p95_latency", "largest_funnel_loss"]
    : dashboard.includes("group-family")
      ? ["completion_rate", "largest_funnel_loss", "weakest_group_size", "document_bottleneck"]
      : dashboard.includes("checkout-recovery")
        ? ["completion_rate", "best_recovery_channel", "best_recovery_timing", "recoverable_drop_step"]
        : dashboard.includes("status-sharing")
          ? ["completion_rate", "largest_funnel_loss", "strongest_segment", "segment_opportunity_gap"]
          : dashboard.includes("instant-forex")
            ? ["completion_rate", "largest_funnel_loss", "strongest_segment", "segment_opportunity_gap"]
            : ["completion_rate", "largest_funnel_loss", "strongest_segment", "segment_opportunity_gap"];

  const completionLabels: Record<string, string> = {
    "dashboard:express-checkout:v1": "Shown → paid completion",
    "dashboard:group-family:v1": "Group submission rate",
    "dashboard:status-sharing-engagement:v1": "Link → recipient action",
    "dashboard:checkout-recovery:v1": "Recovered checkout rate",
    "dashboard:instant-forex:v1": "Offer → purchase attach rate",
  };
  const relabel = (kpi: AnalyticsKPI): AnalyticsKPI => {
    if (kpi.key === "completion_rate") return { ...kpi, label: completionLabels[dashboard] ?? "End-to-end completion" };
    if (kpi.key === "lift_vs_standard") return { ...kpi, label: "Incremental conversion vs standard" };
    if (kpi.key === "p95_latency") return { ...kpi, label: "Slowest 5% time to pay" };
    if (kpi.key === "weakest_otp_segment") {
      const segment = uniqueSegmentLabel(kpi.label.split("·").at(-1)?.trim() ?? "platform cohort");
      return { ...kpi, label: `Weakest OTP cohort · ${segment}` };
    }
    if (kpi.key === "weakest_group_size") return { ...kpi, label: kpi.label.replace("Weakest group size", "At-risk group size") };
    if (kpi.key === "document_bottleneck") return { ...kpi, label: kpi.label.replace("Document bottleneck", "Document completion") };
    if (kpi.key === "best_recovery_channel") return { ...kpi, label: kpi.label.replace("Best recovery", "Best recovery channel") };
    if (kpi.key === "recoverable_drop_step") return { ...kpi, label: kpi.label.replace("Recovery ·", "Best recoverable step ·") };
    return kpi;
  };

  const chosen: AnalyticsKPI[] = [];
  const add = (kpi?: AnalyticsKPI) => {
    if (kpi && !chosen.some((item) => item.key === kpi.key)) chosen.push(relabel(kpi));
  };
  priority.forEach((key) => add(byKey.get(key)));
  bundle.kpis.forEach((kpi) => add(byKey.get(kpi.key)));
  ["completion_rate", "largest_funnel_loss", "strongest_segment"].forEach((key) => add(byKey.get(key)));

  return chosen.slice(0, 4).map((kpi) => ({
    ...kpi,
    evidence_label: `${kpi.sample_size ? `n=${Math.round(kpi.sample_size).toLocaleString()} · ` : ""}${Math.round(kpi.confidence * 100)}% confidence`,
  }));
}

function AnswerCard({ response, onFollowUp, onTrace }: { response: ConversationResponse; onFollowUp: (value: string) => void; onTrace: () => void }) {
  const generated = response.insight.provenance?.generator === "llm";
  const dashboard = response.mode === "dashboard";
  const kpis = response.kpis ?? [];
  return <article className={`fl-answer ${dashboard ? "dashboard" : "single"}`}>
    <div className="fl-answer-author"><BrandMark compact /><div><strong>FeatureLens AI</strong><span>{generated ? "LLM synthesis" : "Governed synthesis"} · context v{response.context_version}</span></div><b>{Math.round(response.insight.confidence * 100)}% confidence</b></div>
    <div className="fl-scope-chips">{dashboard && <span className="fl-mode-chip">◫ Dashboard</span>}{response.feature_scope.map((feature) => <span key={feature}>{feature}</span>)}</div>
    <h2>{response.insight.headline}</h2>
    <p className="fl-answer-summary">{response.insight.summary}</p>
    {dashboard
      ? <>
          {kpis.length > 0 && <div className="fl-answer-kpis">{kpis.map((kpi) => <div key={kpi.key}><span>{kpi.label}</span><strong>{kpi.formatted_value}</strong><small>{Math.round(kpi.confidence * 100)}% confidence</small></div>)}</div>}
          {response.charts?.length > 0 && <div className="fl-answer-charts dashboard">{response.charts.map((chart) => <Chart key={`${response.insight.trace_id}-${chart.key}`} chart={chart} />)}</div>}
        </>
      : response.charts?.length > 0 && <div className="fl-answer-charts single">{response.charts.slice(0, 1).map((chart) => <Chart key={`${response.insight.trace_id}-${chart.key}`} chart={chart} />)}</div>}
    <div className="fl-decision-row"><div><i>↗</i><span><strong>Why it matters</strong><p>{response.insight.why}</p></span></div><div><i>⚑</i><span><strong>Recommended next step</strong><p>{response.insight.recommended_action}</p></span></div></div>
    {(response.contract.limitations?.length ?? 0) > 0 && <p className="fl-boundary"><strong>Evidence boundary</strong>{response.contract.limitations?.[0]}</p>}
    <div className="fl-trust-row"><span>◉ {response.sources.length} governed source{response.sources.length === 1 ? "" : "s"}</span><button onClick={onTrace}>View trace ↗</button></div>
    <details className="fl-evidence"><summary>How this answer was generated <span>⌄</span></summary><div>{response.sources.map((source) => <article key={`${source.contract.feature}-${source.insight.trace_id}`}><span>{source.contract.feature}</span><strong>{source.insight.headline}</strong><small>{source.contract.playbook} · {source.contract.answerability}</small>{source.insight.sql && <details><summary>View ClickHouse query</summary><pre>{source.insight.sql}</pre></details>}</article>)}</div></details>
    <div className="fl-followups">{response.follow_up_prompts.map((prompt) => <button key={prompt} onClick={() => onFollowUp(prompt)}>✦ {prompt}</button>)}</div>
  </article>;
}

const observationNames: Record<string, string> = {
  "tool.clickhouse.query": "analytics.clickhouse_query",
  "evidence.validate": "analytics.evidence_validate",
  "llm.synthesize": "analytics.llm_synthesize",
  "answer.compose": "analytics.portfolio_conversation",
};

const evaluationTargetSteps = new Set(["llm.synthesize", "answer.compose"]);
const finalAnswerStepID = "answer.compose";

function scoreDisplay(score: LangfuseScore) {
  if (typeof score.value === "boolean") return score.value ? "Passed" : "Needs review";
  if (typeof score.value === "number") return score.value >= 0 && score.value <= 1 ? `${Math.round(score.value * 100)}%` : score.value.toFixed(2);
  return String(score.value ?? "—").replaceAll("_", " ");
}

function TraceWorkspace({ insight, tracing }: { insight?: Insight; tracing: RuntimeStatus | null }) {
  const trace = insight?.trace;
  const [selected, setSelected] = useState(trace?.steps?.[0]?.id ?? "");
  const [tab, setTab] = useState<"io" | "evaluations" | "metadata">("io");
  const [langfuse, setLangfuse] = useState<LangfuseTraceInsights | null>(null);
  const [syncState, setSyncState] = useState<"local" | "syncing" | "pending" | "synced" | "unavailable">(tracing?.enabled ? "syncing" : "local");
  const [syncError, setSyncError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [issue, setIssue] = useState("");
  const [comment, setComment] = useState("");
  const [feedbackState, setFeedbackState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  useEffect(() => {
    if (!trace || !tracing?.enabled) {
      setLangfuse(null); setSyncState("local"); setSyncError("");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function load(attempt: number) {
      if (attempt === 0) setSyncState("syncing");
      try {
        const response = await fetch(`${API}/api/traces/${trace!.trace_id}/langfuse`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Langfuse insights unavailable");
        if (cancelled) return;
        setLangfuse(payload as LangfuseTraceInsights); setSyncError("");
        const waitingForScores = payload.status === "pending" || (payload.observations?.length > 0 && payload.scores?.length === 0);
        if (waitingForScores && attempt < 3) {
          setSyncState("pending");
          timer = setTimeout(() => void load(attempt + 1), 1500 * (attempt + 1));
        } else setSyncState(payload.status === "synced" ? "synced" : "pending");
      } catch (cause) {
        if (cancelled || controller.signal.aborted) return;
        setSyncState("unavailable"); setSyncError(cause instanceof Error ? cause.message : "Langfuse insights unavailable");
      }
    }
    void load(0);
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [trace, tracing?.enabled, refresh]);

  useEffect(() => {
    const helpfulScore = langfuse?.scores.find((score) => score.name === "user_helpful" && typeof score.value === "boolean");
    const issueScore = langfuse?.scores.find((score) => score.name === "issue_category" && typeof score.value === "string");
    if (helpfulScore) { setHelpful(helpfulScore.value as boolean); setComment(helpfulScore.comment ?? ""); }
    if (issueScore) setIssue(String(issueScore.value));
  }, [langfuse]);

  if (!trace) return <div className="fl-empty-state"><span>⌁</span><strong>No analytical trace selected</strong><p>Ask a question or select a completed feature insight to inspect user input, context resolution, ClickHouse queries, and synthesis.</p></div>;

  const step = trace.steps.find((item) => item.id === selected) ?? trace.steps[0];
  const observationFor = (item?: AnalysisTraceStep) => {
    if (!item) return undefined;
    return langfuse?.observations.find((observation) => observation.id === item.observation_id)
      ?? langfuse?.observations.find((observation) => observation.name === observationNames[item.id]);
  };
  const scoresFor = (item?: AnalysisTraceStep) => {
    if (!item) return [];
    const observation = observationFor(item);
    return langfuse?.scores.filter((score) => (score.subject.kind === "observation" && score.subject.id === observation?.id)
      || (item.id === "answer.compose" && score.subject.kind === "trace" && score.subject.id === trace.trace_id)) ?? [];
  };
  const observation = observationFor(step);
  const scores = scoresFor(step);
  const isEvaluationTarget = evaluationTargetSteps.has(step?.id ?? "");
  const isFinalAnswerStep = step?.id === finalAnswerStepID;
  const helpfulScore = langfuse?.scores.find((score) => score.name === "user_helpful" && typeof score.value === "boolean");
  const qualityLabel = helpfulScore ? (helpfulScore.value ? "Helpful" : "Review") : langfuse?.scores.length ? `${langfuse.scores.length} signals` : syncState === "synced" ? "No scores" : "Pending";
  const costLabel = langfuse?.summary.total_cost ? `$${langfuse.summary.total_cost.toFixed(4)}` : "—";
  const statusLabel = syncState === "local" ? "Local trace" : syncState === "syncing" ? "Syncing" : syncState === "pending" ? "Evaluating" : syncState === "synced" ? "Synced" : "Unavailable";
  const finalAnswerStep = trace.steps.find((item) => item.id === finalAnswerStepID);
  const finalAnswerObservationID = observationFor(finalAnswerStep)?.id ?? finalAnswerStep?.observation_id;

  async function submitFeedback() {
    if (helpful === null) return;
    setFeedbackState("saving"); setFeedbackMessage("");
    try {
      const response = await fetch(`${API}/api/traces/${trace!.trace_id}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful, issue: helpful ? "" : issue, comment, observation_id: finalAnswerObservationID }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Feedback could not be saved");
      setFeedbackState("saved"); setFeedbackMessage("Feedback added to this Langfuse trace."); setRefresh((value) => value + 1);
    } catch (cause) {
      setFeedbackState("error"); setFeedbackMessage(cause instanceof Error ? cause.message : "Feedback could not be saved");
    }
  }

  const remoteInput = observation?.input ?? step?.input ?? {};
  const remoteOutput = observation?.output ?? step?.output ?? {};
  return <div className="fl-trace-workspace">
    <div className="fl-trace-summary">
      <div><span>Trace</span><code>{compactID(trace.trace_id)}</code></div><div><span>Role</span><strong>{trace.role.replaceAll("_", " ")}</strong></div>
      <div><span>Context</span><strong>v{trace.context_version}</strong></div><div><span>Schema</span><strong>{trace.schema_version}</strong></div>
      <div><span>Rows</span><strong>{trace.dataset_rows.toLocaleString()}</strong></div><div><span>Quality</span><strong className={helpfulScore?.value === false ? "warning" : ""}>{qualityLabel}</strong></div>
      <div><span>LLM cost</span><strong>{costLabel}</strong></div><div><span>Langfuse</span><strong>{statusLabel}</strong></div>
    </div>
    {syncError && <div className="fl-trace-sync-warning"><span>Langfuse is temporarily unavailable.</span><button onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
    <div className="fl-trace-body">
      <nav>{trace.steps.map((item, index) => { const signalCount = scoresFor(item).length; return <button key={item.id} className={item.id === step?.id ? "active" : ""} onClick={() => setSelected(item.id)}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{item.id.replaceAll(".", " / ")}</strong><small>{item.kind} · {item.duration_ms}ms{item.observation_id ? " · linked" : ""}</small></span><b className={signalCount ? "signals" : ""}>{signalCount || (item.status === "completed" ? "✓" : item.status === "skipped" ? "–" : "!")}</b></button>; })}</nav>
      <article className="fl-trace-detail">
        <header><div><span>{step?.kind}{observation?.type ? ` · ${observation.type.toLowerCase()}` : ""}</span><h3>{step?.id.replaceAll(".", " / ")}</h3></div><div className="fl-trace-detail-actions"><code>{step?.duration_ms ?? 0} ms</code>{tracing?.enabled && <button onClick={() => setRefresh((value) => value + 1)} disabled={syncState === "syncing"}>Refresh</button>}{langfuse?.url && <a href={langfuse.url} target="_blank" rel="noreferrer">Open in Langfuse ↗</a>}</div></header>
        {step?.error && <p className="fl-inline-error">{step.error}</p>}
        <div className="fl-trace-tabs" role="tablist" aria-label="Trace observation details">
          <button className={tab === "io" ? "active" : ""} onClick={() => setTab("io")} role="tab" aria-selected={tab === "io"}>Input / output</button>
          <button className={tab === "evaluations" ? "active" : ""} onClick={() => setTab("evaluations")} role="tab" aria-selected={tab === "evaluations"}>Evaluations {scores.length > 0 && <b>{scores.length}</b>}</button>
          <button className={tab === "metadata" ? "active" : ""} onClick={() => setTab("metadata")} role="tab" aria-selected={tab === "metadata"}>Metadata</button>
        </div>
        {tab === "io" && <section className="fl-trace-io"><div><span>Input</span><pre>{JSON.stringify(remoteInput, null, 2)}</pre></div><div><span>Output</span><pre>{JSON.stringify(remoteOutput, null, 2)}</pre></div></section>}
        {tab === "evaluations" && <section className={`fl-trace-evaluations ${isFinalAnswerStep ? "" : "single"}`}>
          <div className="fl-score-list">{scores.length ? scores.map((score) => <article key={score.id} className={typeof score.value === "boolean" ? (score.value ? "passed" : "review") : ""}><header><div><span>{score.source}</span><strong>{score.name.replaceAll("_", " ")}</strong></div><b>{scoreDisplay(score)}</b></header>{score.comment && <p>{score.comment}</p>}<footer>{score.data_type.toLowerCase()}{score.timestamp ? ` · ${formatTime(score.timestamp)}` : ""}{score.author_user_id ? " · human annotation" : ""}</footer></article>) : isEvaluationTarget ? <div className="fl-trace-tab-empty"><strong>Evaluation pending</strong><p>This step is eligible for Langfuse evaluation. Scores will appear when its configured judge or reviewer completes.</p></div> : <div className="fl-trace-tab-empty"><strong>No evaluation configured for this step</strong><p>Evaluations currently run on the generated insight and final answer.</p></div>}</div>
          {isFinalAnswerStep && <aside className="fl-trace-feedback"><span>Product feedback</span><h4>Was the final answer useful?</h4><div className="fl-feedback-vote"><button className={helpful === true ? "active" : ""} aria-pressed={helpful === true} onClick={() => { setHelpful(true); setIssue(""); setFeedbackState("idle"); }}>↑ Yes</button><button className={helpful === false ? "active negative" : ""} aria-pressed={helpful === false} onClick={() => { setHelpful(false); setFeedbackState("idle"); }}>↓ No</button></div>{helpful === false && <label><span>What needs attention?</span><select value={issue} onChange={(event) => setIssue(event.target.value)}><option value="">Choose a category</option><option value="wrong_answer">Wrong answer</option><option value="missing_context">Missing context</option><option value="bad_sql">Incorrect SQL or evidence</option><option value="unclear">Unclear explanation</option><option value="other">Other</option></select></label>}<label><span>Comment <small>{comment.length}/500</small></span><textarea maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add evidence or context for the reviewer…" /></label><button className="fl-feedback-submit" onClick={() => void submitFeedback()} disabled={!tracing?.enabled || syncState !== "synced" || helpful === null || feedbackState === "saving"}>{feedbackState === "saving" ? "Saving…" : "Save feedback"}</button>{feedbackMessage && <p className={feedbackState}>{feedbackMessage}</p>}{!tracing?.enabled && <p>Connect Langfuse to enable feedback.</p>}</aside>}
        </section>}
        {tab === "metadata" && <section className="fl-trace-metadata">{observation ? <><dl><div><dt>Observation ID</dt><dd><code>{observation.id}</code></dd></div><div><dt>Observation</dt><dd>{observation.name ?? "—"}</dd></div><div><dt>Type</dt><dd>{observation.type?.toLowerCase() ?? "—"}</dd></div><div><dt>Status</dt><dd>{observation.level?.toLowerCase() ?? "default"}</dd></div><div><dt>Model</dt><dd>{observation.model ?? "—"}</dd></div><div><dt>Environment</dt><dd>{observation.environment ?? "default"}</dd></div><div><dt>Version</dt><dd>{observation.version ?? "—"}</dd></div><div><dt>Release</dt><dd>{observation.release ?? "—"}</dd></div><div><dt>Latency</dt><dd>{observation.latency ? `${observation.latency.toFixed(2)}s` : "—"}</dd></div><div><dt>Cost</dt><dd>{observation.cost ? `$${observation.cost.toFixed(5)}` : "—"}</dd></div></dl><div><span>Usage</span><pre>{JSON.stringify(observation.usage ?? {}, null, 2)}</pre></div></> : <div className="fl-trace-tab-empty"><strong>Remote metadata is not available</strong><p>The local execution path remains available while this observation syncs to Langfuse.</p></div>}</section>}
      </article>
    </div>
  </div>;
}

export default function ProductWorkspace() {
  const [view, setView] = useState<View>("ask");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [analyticsRuntime, setAnalyticsRuntime] = useState<RuntimeStatus | null>(null);
  const [tracingRuntime, setTracingRuntime] = useState<RuntimeStatus | null>(null);
  const [contextVersion, setContextVersion] = useState(0);
  const [latestContext, setLatestContext] = useState<Run["context"] | null>(null);
  const [catalog, setCatalog] = useState<DataCatalog | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [selection, setSelection] = useState<FeatureID>("express");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyChatId, setBusyChatId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const role = "product_manager";
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [chatsHydrated, setChatsHydrated] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [powerChatOpen, setPowerChatOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [intakeName, setIntakeName] = useState("New product feature");
  const [intakeSlug, setIntakeSlug] = useState("new-product-feature");
  const [schemaVersion, setSchemaVersion] = useState(1);
  const [specFile, setSpecFile] = useState<UploadFile | null>(null);
  const [eventFile, setEventFile] = useState<UploadFile | null>(null);
  const [preflight, setPreflight] = useState<EventPreflight | null>(null);
  const [intakeError, setIntakeError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0] ?? null;
  const conversation = useMemo(() => activeChat?.turns ?? [], [activeChat]);
  const chatBusy = busyChatId !== null;
  const activeChatBusy = busyChatId !== null && busyChatId === activeChat?.id;
  const pendingRuns = useMemo(() => runs.filter((item) => item.stage === "awaiting_approval"), [runs]);
  const publishedRuns = useMemo(() => runs.filter((item) => item.stage === "completed" && item.context), [runs]);
  const customRuns = useMemo(() => runs.filter((item) => !knownFeatureNames.has(normalize(item.input?.name))), [runs]);
  const selectedPackage = featurePackages.find((item) => item.id === selection);
  const selectedCustomRun = customRuns.find((item) => customFeatureID(item) === selection);
  const selectedRun = selectedPackage ? runs.find((item) => normalize(item.input?.name) === normalize(selectedPackage.name)) : selectedCustomRun;
  const selectedCustomIndex = selectedCustomRun ? customRuns.findIndex((item) => item.id === selectedCustomRun.id) : -1;
  const selectedReleaseOrder = selectedPackage?.order ?? (selectedCustomIndex >= 0 ? String(featurePackages.length + selectedCustomIndex + 1).padStart(2, "0") : String(featurePackages.length + customRuns.length + 1).padStart(2, "0"));
  const selectedFeatureName = selectedRun?.input?.name ?? selectedPackage?.name ?? (selection === "unseen" ? intakeName : "Feature release");
  const activeInsight = [...conversation].reverse().find((turn) => turn.response)?.response?.insight ?? run?.insight;
  const sourceTables = catalog?.tables?.filter((table) => table.category === "source") ?? [];
  const agentTables = catalog?.tables?.filter((table) => table.category === "agent_created") ?? [];
  const starterPrompts = useMemo(() => starterPromptsFromContext(latestContext), [latestContext]);
  const nodeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of latestContext?.nodes ?? []) counts[node.type] = (counts[node.type] ?? 0) + 1;
    return counts;
  }, [latestContext]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/health`).then(async (response) => ({ ok: response.ok, body: response.ok ? await response.json() : {} })),
      fetch(`${API}/api/context/latest`).then((response) => response.json()),
      fetch(`${API}/api/runs`).then((response) => response.json()),
      fetch(`${API}/api/catalog`).then((response) => response.ok ? response.json() : null),
    ]).then(([health, context, recent, liveCatalog]) => {
      const nextRuns: Run[] = recent.runs ?? [];
      setConnected(health.ok);
      setAnalyticsRuntime(health.body.analytics_agent ?? null);
      setTracingRuntime(health.body.tracing ?? null);
      setContextVersion(context.version ?? 0);
      setLatestContext(context);
      setCatalog(liveCatalog);
      setRuns(nextRuns);
      const preferred = nextRuns.find((item) => normalize(item.input?.name) === "express checkout") ?? nextRuns.find((item) => item.stage === "completed") ?? nextRuns[0];
      if (preferred) setRun(preferred);
    }).catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    const stored = loadStoredChats();
    const initial = stored.length ? stored : [createChat()];
    setChats(initial);
    setActiveChatId(initial[0].id);
    setChatsHydrated(true);
  }, []);

  useEffect(() => {
    if (!chatsHydrated) return;
    try { window.localStorage.setItem(chatStorageKey, JSON.stringify(chats)); } catch { /* storage unavailable or full */ }
  }, [chats, chatsHydrated]);

  useEffect(() => {
    if (!run?.id || ["completed", "failed"].includes(run.stage)) return;
    const source = new EventSource(`${API}/api/runs/${run.id}/events`);
    source.addEventListener("stage", async (raw) => {
      const event = JSON.parse((raw as MessageEvent).data) as RunEvent;
      setEvents((current) => current.some((item) => item.stage === event.stage && item.timestamp === event.timestamp) ? current : [...current, event]);
      const response = await fetch(`${API}/api/runs/${run.id}`);
      if (response.ok) {
        const next = await response.json() as Run;
        setRun(next);
        setRuns((current) => [next, ...current.filter((item) => item.id !== next.id)]);
        if (next.context) {
          setContextVersion(next.context.version);
          setLatestContext(next.context);
        }
        if (["completed", "failed"].includes(next.stage)) source.close();
      }
    });
    return () => source.close();
  }, [run?.id, run?.stage]);

  useEffect(() => {
    if (conversation.length || chatBusy) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversation, chatBusy]);

  function updateChatById(id: string, updater: (chat: Chat) => Chat) {
    setChats((current) => current.map((chat) => (chat.id === id ? updater(chat) : chat)));
  }

  function startNewChat(switchToAsk = true) {
    const chat = createChat();
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setRenamingChatId(null);
    if (switchToAsk) {
      setQuestion("");
      setView("ask");
    }
    return chat;
  }

  function selectChat(id: string) {
    setActiveChatId(id);
    setRenamingChatId(null);
  }

  function deleteChat(id: string) {
    const remaining = chats.filter((chat) => chat.id !== id);
    const next = remaining.length ? remaining : [createChat()];
    setChats(next);
    if (renamingChatId === id) setRenamingChatId(null);
    if (!next.some((chat) => chat.id === activeChatId)) setActiveChatId(next[0].id);
  }

  function beginRename(chat: Chat) {
    setRenamingChatId(chat.id);
    setRenameDraft(chat.title);
  }

  function commitRename(id: string) {
    const title = renameDraft.trim();
    if (title) updateChatById(id, (chat) => ({ ...chat, title }));
    setRenamingChatId(null);
  }

  function chooseFeature(id: FeatureID, nextView: View = "releases") {
    setSelection(id);
    const item = featurePackages.find((feature) => feature.id === id);
    const matching = item ? runs.find((candidate) => normalize(candidate.input?.name) === normalize(item.name)) : runs.find((candidate) => customFeatureID(candidate) === id);
    setRun(matching ?? null);
    setEvents([]);
    setView(nextView);
    setError("");
  }

  function askAboutSelectedFeature() {
    if (!selectedRun || selectedRun.stage !== "completed") return;
    startNewChat(false);
    setRun(selectedRun);
    setQuestion(`How is ${selectedFeatureName} performing, and what should I prioritize next?`);
    setView("ask");
    setError("");
  }

  async function launchFeature() {
    if (selection === "unseen") {
      setIntakeOpen(true);
      return;
    }
    if (selectedRun) { setRun(selectedRun); setView("pipeline"); return; }
    if (!selectedPackage) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: selectedPackage.name, schema_version: selectedPackage.schemaVersion, spec_markdown: selectedPackage.spec, use_existing_data: true, role, auto_approve: false }) });
      const payload = await response.json() as Run & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not start feature analysis");
      setRun(payload);
      setRuns((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
      setEvents([]);
      setView("pipeline");
      setConnected(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Backend unavailable"); } finally { setBusy(false); }
  }

  async function approveRun(target: Run) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/runs/${target.id}/approve`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Approval failed");
      setRun(target);
      setView("pipeline");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval failed"); } finally { setBusy(false); }
  }

  async function ask(prompt?: string) {
    const submitted = (prompt ?? question).trim();
    if (!submitted || chatBusy || publishedRuns.length === 0) return;
    const target = activeChat ?? startNewChat(false);
    const before = target.turns;
    const lastAssistant = [...before].reverse().find((turn) => turn.response);
    updateChatById(target.id, (chat) => ({
      ...chat,
      title: chat.turns.length === 0 ? chatTitleFrom(submitted) : chat.title,
      updatedAt: Date.now(),
      turns: [...chat.turns, { id: `u-${Date.now()}`, role: "user", content: submitted }],
    }));
    setQuestion("");
    setBusyChatId(target.id);
    setError("");
    try {
      const response = await fetch(`${API}/api/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        role,
        question: submitted,
        active_features: lastAssistant?.response?.feature_scope,
        context_version: contextVersion || undefined,
        history: before.map((turn) => ({ role: turn.role, content: turn.response?.insight.summary ?? turn.content, feature_scope: turn.response?.feature_scope ?? turn.featureScope })),
      }) });
      const payload = await response.json() as ConversationResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Question failed");
      updateChatById(target.id, (chat) => ({
        ...chat,
        updatedAt: Date.now(),
        turns: [...chat.turns, { id: `a-${Date.now()}`, role: "assistant", content: payload.insight.summary, featureScope: payload.feature_scope, response: payload }],
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Question failed"); } finally { setBusyChatId(null); }
  }

  async function loadSpec(file?: File) {
    setIntakeError("");
    if (!file) return setSpecFile(null);
    if (file.size > maxIntakeBytes) return setIntakeError("Specification exceeds the 15 MB limit");
    const text = await file.text();
    if (!text.trim()) return setIntakeError("Specification file is empty");
    setSpecFile({ name: file.name, size: file.size, text });
  }

  async function loadEvents(file?: File) {
    setIntakeError("");
    setPreflight(null);
    if (!file) return setEventFile(null);
    if (file.size > maxIntakeBytes) return setIntakeError("Event file exceeds the 15 MB limit");
    const text = await file.text();
    try { setPreflight(inspectNDJSON(text)); setEventFile({ name: file.name, size: file.size, text }); } catch (cause) { setEventFile(null); setIntakeError(cause instanceof Error ? cause.message : "Event package is invalid"); }
  }

  async function submitUnseen() {
    if (!intakeName.trim() || !specFile || !eventFile || !preflight) return setIntakeError("Add a feature name, specification, and valid NDJSON events");
    setBusy(true);
    setIntakeError("");
    try {
      const response = await fetch(`${API}/api/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: intakeName.trim(), slug: intakeSlug || slugify(intakeName), schema_version: schemaVersion, spec_markdown: specFile.text, events_ndjson: eventFile.text, role, auto_approve: false }) });
      const payload = await response.json() as Run & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not submit the feature");
      setSelection(customFeatureID(payload));
      setRun(payload);
      setRuns((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
      setEvents([]);
      startNewChat(false);
      setIntakeOpen(false);
      setView("pipeline");
    } catch (cause) { setIntakeError(cause instanceof Error ? cause.message : "Backend unavailable"); } finally { setBusy(false); }
  }

  async function resetBaseline() {
    if (resetConfirmation !== "RESET") return;
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/admin/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "RESET_CONTEXT" }) });
      const payload = await response.json() as { error?: string; context_version?: number; context?: Run["context"] };
      if (!response.ok) throw new Error(payload.error ?? "Reset failed");
      const freshChat = createChat();
      setRuns([]); setRun(null); setEvents([]); setChats([freshChat]); setActiveChatId(freshChat.id); setRenamingChatId(null); setSelection("express"); setContextVersion(payload.context_version ?? 0); setLatestContext(payload.context ?? null); setResetOpen(false); setResetConfirmation(""); setView("ask");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reset failed"); setResetOpen(false); } finally { setBusy(false); }
  }

  function openPowerChat() {
    const url = powerChatURL();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setPowerChatOpen(true);
  }

  const featureStatus = (name: string) => runs.find((item) => normalize(item.input?.name) === normalize(name));
  const rank = run ? Math.max(0, stageOrder.indexOf(run.stage)) : 0;

  return <main className="fl-app">
    <aside className="fl-sidebar">
      <div className="fl-brand"><BrandMark /><strong>FeatureLens</strong></div>
      <nav aria-label="Primary navigation">
        <button className={view === "ask" ? "active" : ""} onClick={() => setView("ask")}><i>◌</i><span>Ask FeatureLens</span></button>
        <button className={view === "decisions" ? "active" : ""} onClick={() => setView("decisions")}><i>□</i><span>Decision inbox</span>{pendingRuns.length > 0 && <b>{pendingRuns.length}</b>}</button>
        <button className={view === "releases" ? "active" : ""} onClick={() => setView("releases")}><i>▦</i><span>Feature releases</span></button>
      </nav>
      <button className="fl-add-feature" onClick={() => setIntakeOpen(true)}><i>＋</i><span>Add feature</span></button>
      <div className="fl-sidebar-divider" />
      <p className="fl-sidebar-label">System</p>
      <nav aria-label="System navigation">
        <button className={view === "pipeline" ? "active" : ""} onClick={() => setView("pipeline")}><i>⌁</i><span>Pipeline activity</span></button>
        <button className={view === "context" ? "active" : ""} onClick={() => setView("context")}><i>◎</i><span>Context &amp; schemas</span></button>
        <button className={view === "trace" ? "active" : ""} onClick={() => setView("trace")}><i>⌕</i><span>Trace explorer</span></button>
      </nav>
      <div className="fl-sidebar-foot"><button onClick={() => setResetOpen(true)} disabled={busy}><i>↺</i><span>Reset baseline</span></button><div className="fl-user"><span>AM</span><div><strong>Ajay</strong><small>Product Manager</small></div></div></div>
    </aside>

    <section className="fl-shell">
      <header className="fl-topbar"><button className="fl-product-switch"><i>▥</i> Atlys Product <span>⌄</span></button><div><button className="fl-context-pill" onClick={() => setView("context")}>▱ Context v{contextVersion}</button><button className="fl-power-button" onClick={openPowerChat}>◉ Open Power Chat ↗</button><span className="fl-avatar">AM</span></div></header>
      {error && <div className="fl-error"><span>!</span><p>{error}</p><button onClick={() => setError("")}>×</button></div>}

      {view === "ask" && <section className="fl-chat-page">
        <aside className="fl-chat-history" aria-label="Saved chats">
          <button className="fl-new-chat" onClick={() => startNewChat()}><i>＋</i><span>New chat</span></button>
          <p className="fl-chat-history-label">Chats</p>
          <div className="fl-chat-list">
            {chats.map((chat) => <div key={chat.id} className={`fl-chat-item ${chat.id === activeChat?.id ? "active" : ""}`}>
              {renamingChatId === chat.id
                ? <input autoFocus value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onBlur={() => commitRename(chat.id)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(chat.id); if (event.key === "Escape") setRenamingChatId(null); }} aria-label="Rename chat" />
                : <button className="fl-chat-open" onClick={() => selectChat(chat.id)} onDoubleClick={() => beginRename(chat)} title={`${chat.title} — double-click to rename`}><strong>{chat.title}</strong><small>{chat.id === busyChatId ? "Thinking…" : chat.turns.length === 0 ? "No messages yet" : `${chat.turns.length} message${chat.turns.length === 1 ? "" : "s"} · ${formatTime(new Date(chat.updatedAt).toISOString())}`}</small></button>}
              <button className="fl-chat-delete" aria-label={`Delete chat ${chat.title}`} onClick={() => deleteChat(chat.id)}>×</button>
            </div>)}
          </div>
        </aside>
        <div className="fl-chat-main">
          <div className={`fl-conversation ${conversation.length === 0 ? "empty" : ""}`} aria-live="polite">
            {conversation.length === 0 ? <div className="fl-welcome"><span className="fl-welcome-mark"><BrandMark /></span><h2>How can I help?</h2><p>Ask across every published feature. FeatureLens resolves the latest business context, runs governed ClickHouse queries, and shows the evidence behind every answer.</p><div>{starterPrompts.map((prompt) => <button key={prompt} onClick={() => void ask(prompt)} disabled={!publishedRuns.length || chatBusy}><i>◌</i>{prompt}<span>→</span></button>)}</div></div> : conversation.map((turn) => turn.role === "user" ? <div className="fl-user-message" key={turn.id}><span>You</span><p>{turn.content}</p><i>AM</i></div> : turn.response ? <AnswerCard key={turn.id} response={turn.response} onFollowUp={(prompt) => void ask(prompt)} onTrace={() => setView("trace")} /> : null)}
            {activeChatBusy && <div className="fl-thinking"><BrandMark compact /><i /><i /><i /><span>Resolving context and querying ClickHouse…</span></div>}
            <div ref={endRef} />
          </div>
          <form className="fl-composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Ask about a feature, segment, trend, or opportunity…" rows={2} aria-label="Ask FeatureLens" /><div><span><i className={connected ? "live" : ""} /> Governed data</span><button type="submit" aria-label="Send question" disabled={chatBusy || !question.trim() || !publishedRuns.length}>↑</button></div></form>
        </div>
      </section>}

      {view === "decisions" && <section className="fl-page"><div className="fl-page-title"><div><h1>Decision inbox</h1><p>Approvals and evidence-backed recommendations that need your attention.</p></div></div>
        {pendingRuns.length > 0 && <div className="fl-section-block"><div className="fl-block-title"><span>Needs approval</span><b>{pendingRuns.length}</b></div><div className="fl-approval-list">{pendingRuns.map((item) => <article key={item.id}><div><span>Schema approval</span><h3>{item.input?.name}</h3><p>The Instrumentation Agent has verified the proposed ClickHouse contract. Context publication is waiting for your decision.</p></div><dl><div><dt>Table</dt><dd>{item.schema?.table ?? "Preparing"}</dd></div><div><dt>Rows</dt><dd>{item.profile?.rows?.toLocaleString() ?? "—"}</dd></div><div><dt>Checks</dt><dd>{item.validation?.checks.filter((check) => check.passed).length ?? 0}/{item.validation?.checks.length ?? 0}</dd></div></dl><button onClick={() => void approveRun(item)} disabled={busy}>Review &amp; approve →</button></article>)}</div></div>}
        <div className="fl-section-block"><div className="fl-block-title"><span>Latest recommendations</span><b>{publishedRuns.length}</b></div><div className="fl-decision-list">{publishedRuns.flatMap((item) => (item.analytics_bundle?.insights ?? []).slice(0, 1).map((insight) => <article key={`${item.id}-${insight.rank}`}><span>{item.input?.name}</span><h3>{insight.headline}</h3><p>{insight.summary}</p><div><strong>Next action</strong>{insight.recommended_action}</div><footer><span>{Math.round(insight.confidence * 100)}% confidence</span><button onClick={() => { setRun(item); setSelection(featureSelectionForRun(item)); setView("releases"); }}>Open feature →</button></footer></article>))}{publishedRuns.length === 0 && <div className="fl-empty-state"><span>✦</span><strong>No recommendations yet</strong><p>Publish the first feature context to create a decision-ready analytics bundle.</p></div>}</div></div>
      </section>}

      {view === "releases" && <section className="fl-page"><div className="fl-page-title"><div><h1>Feature releases</h1><p>Explore the product intelligence available for each release.</p></div><button className="fl-primary" onClick={() => setIntakeOpen(true)}>＋ Add feature</button></div><div className="fl-release-layout"><aside>{featurePackages.map((feature) => { const item = featureStatus(feature.name); return <button key={feature.id} className={selection === feature.id ? "active" : ""} onClick={() => chooseFeature(feature.id)}><span>{feature.order}</span><div><strong>{feature.name}</strong><small>{item?.stage === "completed" ? "Published" : item ? item.stage.replaceAll("_", " ") : "Not analyzed"}</small></div><i className={item?.stage === "completed" ? "published" : ""} /></button>; })}{customRuns.map((item, index) => { const id = customFeatureID(item); return <button key={item.id} className={`${selection === id ? "active " : ""}${index === 0 ? "unseen" : ""}`} onClick={() => chooseFeature(id)}><span>{String(featurePackages.length + index + 1).padStart(2, "0")}</span><div><strong>{item.input?.name ?? "Custom release"}</strong><small>{item.stage === "completed" ? "Published" : item.stage.replaceAll("_", " ")}</small></div><i className={item.stage === "completed" ? "published" : ""} /></button>; })}<button className={`${selection === "unseen" ? "active " : ""}${customRuns.length === 0 ? "unseen" : ""}`} onClick={() => chooseFeature("unseen")}><span>{String(featurePackages.length + customRuns.length + 1).padStart(2, "0")}</span><div><strong>Add another release</strong><small>Upload spec and events</small></div><i /></button></aside><article className="fl-release-detail"><div className="fl-release-head"><div><span>{selectedReleaseOrder} · {selectedRun?.stage === "completed" ? "Published" : selectedRun ? selectedRun.stage.replaceAll("_", " ") : "Ready to analyze"}</span><h2>{selectedFeatureName}</h2><p>{selectedPackage?.description ?? "A new product release that will evolve instrumentation, context, and analytics without feature-specific code."}</p></div><button className="fl-primary" onClick={() => selectedRun?.stage === "completed" ? askAboutSelectedFeature() : void launchFeature()} disabled={busy}>{selectedRun?.stage === "completed" ? "Ask about this release" : selectedRun ? "View pipeline" : selection === "unseen" ? "Add release" : "Analyze release"} →</button></div><div className="fl-release-facts"><div><span>Event rows</span><strong>{selectedRun?.profile?.rows?.toLocaleString() ?? selectedPackage?.rows ?? "Unknown"}</strong></div><div><span>Decision focus</span><strong>{selectedPackage?.outcome ?? "Adaptive measurement"}</strong></div><div><span>Context</span><strong>{selectedRun?.context ? `v${selectedRun.context.version}` : "Not published"}</strong></div><div><span>Schema</span><strong>{selectedRun?.schema ? `v${selectedRun.schema.version}` : `Proposed v${selectedPackage?.schemaVersion ?? schemaVersion}`}</strong></div></div>{selectedRun?.analytics_bundle ? <div className="fl-feature-insights"><div className="fl-kpis">{releaseDecisionKPIs(selectedRun.analytics_bundle).map((kpi) => <div key={kpi.key}><span>{kpi.label}</span><strong>{kpi.formatted_value}</strong><small>{kpi.evidence_label}</small></div>)}</div>{selectedRun.analytics_bundle.charts.slice(0, 2).map((chart) => <Chart key={chart.key} chart={chart} />)}</div> : <div className="fl-empty-state"><span>✦</span><strong>Feature intelligence is not published yet</strong><p>Start the release to profile events, review the schema, publish its context, and generate actionable insights.</p></div>}</article></div></section>}

      {view === "pipeline" && <section className="fl-page"><div className="fl-page-title"><div><h1>Pipeline activity</h1><p>The governed agent workflow behind the selected feature release.</p></div>{run && <span className={`fl-run-status ${run.stage}`}>{run.stage.replaceAll("_", " ")}</span>}</div>{!run ? <div className="fl-empty-state"><span>⌁</span><strong>No feature run selected</strong><p>Choose a release to inspect its instrumentation, context, and analytics activity.</p></div> : <><div className="fl-agent-timeline"><article className={rank >= 1 ? "done" : ""}><i>I</i><div><span>Instrumentation Agent</span><strong>Schema and event contract</strong><p>{run.schema ? `${run.schema.database}.${run.schema.table}` : "Waiting to profile the release"}</p></div><b>{rank >= 4 ? "✓" : rank >= 1 ? "Working" : "Queued"}</b></article><em>→</em><article className={rank >= 5 ? "done" : ""}><i>C</i><div><span>Context Agent</span><strong>Business meaning and ontology</strong><p>{run.context?.summary ?? "Publishes only after schema approval"}</p></div><b>{rank >= 5 ? "✓" : "Queued"}</b></article><em>→</em><article className={rank >= 6 ? "done" : ""}><i>A</i><div><span>Analytics Agent</span><strong>Evidence and recommendations</strong><p>{run.insight?.headline ?? "Queries the latest published context"}</p></div><b>{rank >= 6 ? "✓" : "Queued"}</b></article></div>{run.stage === "awaiting_approval" && <div className="fl-approval-banner"><div><span>Decision required</span><h3>Approve the ClickHouse contract for {run.input?.name}</h3><p>Nothing is executed or published until this schema passes your review.</p></div><button onClick={() => void approveRun(run)} disabled={busy}>Approve &amp; continue →</button></div>}<div className="fl-pipeline-grid"><article><div className="fl-block-title"><span>Release contract</span></div><dl><div><dt>Table</dt><dd>{run.schema?.table ?? "Preparing"}</dd></div><div><dt>Rows profiled</dt><dd>{run.profile?.rows?.toLocaleString() ?? "—"}</dd></div><div><dt>Event types</dt><dd>{Object.keys(run.profile?.event_counts ?? {}).length}</dd></div><div><dt>Validation</dt><dd>{run.validation?.passed ? "Passed" : "Pending"}</dd></div><div><dt>Context</dt><dd>{run.context ? `v${run.context.version}` : "Pending"}</dd></div><div><dt>Trace</dt><dd>{compactID(run.trace_id)}</dd></div></dl>{run.schema?.ddl && <details><summary>Inspect proposed DDL</summary><pre>{run.schema.ddl}</pre></details>}</article><article><div className="fl-block-title"><span>Activity</span><b>{events.length}</b></div><div className="fl-activity">{events.length ? [...events].reverse().map((event) => <div key={`${event.stage}-${event.timestamp}`}><time>{formatTime(event.timestamp)}</time><i /><span><strong>{event.stage.replaceAll("_", " ")}</strong><p>{event.message}</p></span></div>) : <p>No new activity. The selected run is {run.stage.replaceAll("_", " ")}.</p>}</div></article></div></>}
      </section>}

      {view === "context" && <section className="fl-page"><div className="fl-page-title"><div><h1>Context &amp; schemas</h1><p>The living business model that keeps every analytics answer aligned with the latest feature landscape.</p></div><span className="fl-context-version">Context v{contextVersion}</span></div><div className="fl-context-hero"><div><span>Latest published context</span><h2>{latestContext?.summary ?? "Baseline context is ready"}</h2><p>Features, entities, metrics, dimensions, relationships, and known issues are versioned together. Analytics can only query tables registered in this contract.</p></div><div><div><span>Nodes</span><strong>{latestContext?.nodes?.length ?? 0}</strong></div><div><span>Relationships</span><strong>{latestContext?.edges?.length ?? 0}</strong></div><div><span>Source tables</span><strong>{sourceTables.length}</strong></div><div><span>Agent schemas</span><strong>{agentTables.length}</strong></div></div></div>{(latestContext?.nodes?.length ?? 0) > 0 && <ContextGraph nodes={latestContext?.nodes ?? []} edges={latestContext?.edges ?? []} />}<div className="fl-context-grid"><article><div className="fl-block-title"><span>Business ontology</span><b>{Object.keys(nodeCounts).length} types</b></div><div className="fl-ontology">{Object.entries(nodeCounts).map(([type, count]) => <div key={type}><i>{type.slice(0, 1).toUpperCase()}</i><span><strong>{type.replaceAll("_", " ")}</strong><small>Published semantic objects</small></span><b>{count}</b></div>)}</div></article><article><div className="fl-block-title"><span>ClickHouse source catalog</span><b>{sourceTables.filter((table) => table.context_registered).length}/{sourceTables.length} registered</b></div><div className="fl-table-list">{sourceTables.map((table) => <div key={`${table.database}.${table.name}`}><i className={table.context_registered ? "ready" : ""}>{table.context_registered ? "✓" : "!"}</i><span><strong>{table.name}</strong><small>{table.database} · {table.engine}</small></span><b>{table.rows.toLocaleString()}</b></div>)}</div></article></div>{(latestContext?.conflicts?.length ?? 0) > 0 && <details className="fl-context-conflicts"><summary><span>Context health</span><strong>{latestContext?.conflicts?.length ?? 0} issue{latestContext?.conflicts?.length === 1 ? "" : "s"} require review</strong><i>View details⌄</i></summary><div>{latestContext?.conflicts?.map((conflict) => <p key={conflict.key}><span>{conflict.severity}</span>{conflict.description}</p>)}</div></details>}</section>}

      {view === "trace" && <section className="fl-page"><div className="fl-page-title"><div><h1>Trace explorer</h1><p>Follow the complete path from user question to context, SQL, evidence, and final synthesis.</p></div><span className={`fl-langfuse ${tracingRuntime?.enabled ? "live" : ""}`}><i />Langfuse {tracingRuntime?.enabled ? "connected" : "local trace"}</span></div><TraceWorkspace key={activeInsight?.trace?.trace_id ?? "empty"} insight={activeInsight} tracing={tracingRuntime} /></section>}
    </section>

    {intakeOpen && <div className="fl-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setIntakeOpen(false); }}><section className="fl-intake" role="dialog" aria-modal="true" aria-labelledby="intake-title"><header><div><span>New feature release</span><h2 id="intake-title">Create feature intelligence</h2><p>Upload the product brief and observed events. FeatureLens will propose the ClickHouse contract before anything is executed.</p></div><button onClick={() => setIntakeOpen(false)}>×</button></header><div className="fl-form-grid"><label><span>Feature name</span><input value={intakeName} onChange={(event) => { setIntakeName(event.target.value); setIntakeSlug(slugify(event.target.value)); }} /></label><label><span>Schema version</span><input type="number" min={1} value={schemaVersion} onChange={(event) => setSchemaVersion(Math.max(1, Number(event.target.value) || 1))} /></label><label className="wide"><span>Release slug</span><input value={intakeSlug} onChange={(event) => setIntakeSlug(slugify(event.target.value))} /></label></div><div className="fl-upload-grid"><label className={specFile ? "ready" : ""}><input type="file" accept=".md,.markdown,text/plain" onChange={(event) => void loadSpec(event.target.files?.[0])} /><b>{specFile ? "✓" : "MD"}</b><span><strong>{specFile?.name ?? "Feature specification"}</strong><small>{specFile ? formatBytes(specFile.size) : "Choose spec.md"}</small></span></label><label className={eventFile ? "ready" : ""}><input type="file" accept=".ndjson,.jsonl,application/json,text/plain" onChange={(event) => void loadEvents(event.target.files?.[0])} /><b>{eventFile ? "✓" : "{}"}</b><span><strong>{eventFile?.name ?? "Observed events"}</strong><small>{eventFile ? formatBytes(eventFile.size) : "Choose events.ndjson"}</small></span></label></div>{intakeError && <p className="fl-intake-error">! {intakeError}</p>}{preflight && <div className="fl-preflight"><header><span>Event package</span><b>Ready ✓</b></header><div><span><small>Rows</small><strong>{preflight.rows.toLocaleString()}</strong></span><span><small>Event types</small><strong>{preflight.eventTypes.length}</strong></span><span><small>Fields</small><strong>{preflight.fields}</strong></span></div><p>{preflight.firstEvent} <i>→</i> {preflight.lastEvent}</p></div>}<div className="fl-intake-route"><span>Instrumentation</span><i>→</i><span>Human approval</span><i>→</i><span>Context</span><i>→</i><span>Analytics</span></div><footer><button onClick={() => setIntakeOpen(false)}>Cancel</button><button className="fl-primary" onClick={() => void submitUnseen()} disabled={busy || !specFile || !eventFile || !preflight}>Submit release →</button></footer></section></div>}

    {resetOpen && <div className="fl-modal-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setResetOpen(false); }}><section className="fl-reset" role="dialog" aria-modal="true"><header><span>Reset demo</span><h2>Return the context layer to v0?</h2><p>Agent runs and context versions will be cleared. Raw Atlys and generated feature tables remain untouched.</p></header><label><span>Type <code>RESET</code> to confirm</span><input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} placeholder="RESET" /></label><footer><button onClick={() => setResetOpen(false)}>Keep versions</button><button className="danger" onClick={() => void resetBaseline()} disabled={busy || resetConfirmation !== "RESET"}>Reset baseline</button></footer></section></div>}

    {powerChatOpen && <div className="fl-modal-backdrop centered" onMouseDown={(event) => { if (event.target === event.currentTarget) setPowerChatOpen(false); }}><section className="fl-power-modal" role="dialog" aria-modal="true"><BrandMark /><span>FeatureLens Power Chat</span><h2>LibreChat is ready to connect.</h2><p>Power Chat runs as a separate conversational client through the same governed FeatureLens MCP tools. Configure its public URL to open it from this workspace.</p><div><span>✓ Shared ClickHouse evidence</span><span>✓ Context-aware follow-ups</span><span>✓ Langfuse trace IDs</span></div><footer><button onClick={() => setPowerChatOpen(false)}>Continue in FeatureLens</button></footer></section></div>}
  </main>;
}
