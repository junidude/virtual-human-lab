"use strict";
const isKo = document.documentElement.lang === "ko";
const tr = (en, ko) => isKo ? ko : en;
const ASSETS = "/research/case2rl/assets/review-v1/";
const store = window.Case2RLReviewStore.create();
let requestSequence = 0;
let pendingRequest = null;
const ramDrafts = new Map();
const unsavedContexts = new Set();
const state = {
  runs: [],
  run: null,
  review: emptyReview(),
  filter: "all",
  query: "",
  revealModel: false,
  revealReference: false,
  currentTurnIndex: 0,
  activeReviewer: "",
  entry: null,
  loading: false,
  versionCount: 0,
  openTurns: new Map(),
};

const els = {
  runSelect: document.querySelector("#runSelect"),
  loadRunButton: document.querySelector("#loadRunButton"),
  metricGrid: document.querySelector("#metricGrid"),
  timeline: document.querySelector("#timeline"),
  decisionCard: document.querySelector("#decisionCard"),
  finalReviewForm: document.querySelector("#finalReviewForm"),
  referenceGrid: document.querySelector("#referenceGrid"),
  runTimestamp: document.querySelector("#runTimestamp"),
  visibleTurnCount: document.querySelector("#visibleTurnCount"),
  reviewerId: document.querySelector("#reviewerId"),
  reviewerSpecialty: document.querySelector("#reviewerSpecialty"),
  reviewedCount: document.querySelector("#reviewedCount"),
  flaggedCount: document.querySelector("#flaggedCount"),
  versionCount: document.querySelector("#versionCount"),
  railProgressText: document.querySelector("#railProgressText"),
  railProgressBar: document.querySelector("#railProgressBar"),
  searchInput: document.querySelector("#searchInput"),
  blindToggle: document.querySelector("#blindToggle"),
  referenceToggle: document.querySelector("#referenceToggle"),
  toast: document.querySelector("#toast"),
  sideRail: document.querySelector("#sideRail"),
  menuButton: document.querySelector("#menuButton"),
  menuBackdrop: document.querySelector("#menuBackdrop"),
  loadStatus: document.querySelector("#loadStatus"),
  storageStatus: document.querySelector("#storageStatus"),
  integrityDetails: document.querySelector("#integrityDetails"),
};

const ISSUE_TAGS = [
  ["unnecessary", tr("Unnecessary action", "불필요 행동")],
  ["hallucination", tr("Hallucination", "환각")],
  ["missed_clue", tr("Missed clue", "단서 누락")],
  ["timing", tr("Wrong timing", "시점 문제")],
  ["unsafe", tr("Safety risk", "안전 문제")],
  ["cost", tr("Excess cost", "과도 비용")],
];

function emptyReview() {
  return { reviewer: {id: "", specialty: ""}, turn_reviews: {}, final_review: {},
    visibility: {model_identity_visible: false, reference_visible: false,
      model_identity_ever_revealed: false, reference_ever_revealed: false} };
}
function context() {
  if (!state.run || !state.entry || !state.activeReviewer) return null;
  return { reviewer_id: state.activeReviewer, run_id: state.run.id,
    run_sha256: state.entry.run_sha256, view_sha256: state.entry.file_sha256,
    turn_ids: state.run.turns.map(turn => turn.turn) };
}
function storageMessage(message, error = false) {
  els.storageStatus.textContent = message;
  els.storageStatus.classList.toggle("error", error);
}
function handleStorageError(error) {
  storageMessage(tr("Not saved: ", "저장 실패: ") + error.message, true);
  showToast(error.message, true);
}
function resetVisibility() {
  state.revealModel = false;
  state.revealReference = false;
  state.review.visibility.model_identity_visible = false;
  state.review.visibility.reference_visible = false;
  syncVisibilityControls();
}
function syncVisibilityControls() {
  els.blindToggle.setAttribute("aria-pressed", String(!state.revealModel));
  els.blindToggle.setAttribute("aria-label", state.revealModel ? tr("Hide model identity", "모델명 숨기기") : tr("Reveal model identity", "모델명 보기"));
  els.blindToggle.querySelector("span:last-child").textContent = state.revealModel ? tr("Identity shown", "모델명 표시") : tr("Blinded", "블라인드");
  els.referenceToggle.setAttribute("aria-expanded", String(state.revealReference));
  els.referenceToggle.textContent = state.revealReference ? tr("Hide reference ↑", "원문 진단 숨기기 ↑") : tr("Reveal reference ↓", "원문 진단 보기 ↓");
}
function setReviewEnabled() {
  const enabled = Boolean(context());
  els.timeline.querySelectorAll("input,textarea").forEach(el => { el.disabled = !enabled; });
  [...els.finalReviewForm.elements].forEach(el => { el.disabled = !enabled; });
  els.reviewerSpecialty.disabled = !enabled;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value));
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(isKo ? "ko-KR" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(date);
}

function humanize(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fetchJson(path, expectedHash, signal) {
  const response = await fetch(path, {signal, cache: "no-cache"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 5_000_000) throw new Error("Recorded file is too large.");
  if (expectedHash) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
    if (actual !== expectedHash) throw new Error("Public data SHA-256 mismatch.");
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function renderSelector() {
  const selected = state.entry ? state.runs.indexOf(state.entry) : Number(els.runSelect.value || 0);
  els.runSelect.innerHTML = state.runs.map((run, index) => {
    const identity = state.revealModel && state.entry === run ? run.model : run.candidate_label;
    return `<option value="${index}">${escapeHtml(identity)} · ${run.turns} ${tr("turns", "턴")}</option>`;
  }).join("");
  els.runSelect.value = String(selected < 0 ? 0 : selected);
}
async function loadRuns() {
  try {
    const data = await fetchJson(ASSETS + "manifest.json");
    if (data.schema_version !== "case2rl.public-review-manifest.v1" || !Array.isArray(data.runs) || data.runs.length !== 2) throw new Error("Invalid public manifest.");
    for (const run of data.runs) {
      if (!/^run-[ab]\.json$/.test(run.file) || !/^[a-f0-9]{64}$/.test(run.file_sha256) || !/^[a-f0-9]{64}$/.test(run.run_sha256)) throw new Error("Invalid file binding.");
    }
    state.runs = data.runs;
    renderSelector();
    await loadRun(0);
  } catch (error) {
    els.loadStatus.textContent = tr("Unable to load: ", "불러오기 실패: ") + error.message;
    els.loadStatus.classList.add("error");
    showToast(error.message, true);
  }
}
async function loadRun(index) {
  const entry = state.runs[Number(index)];
  if (!entry) return;
  persistDraft();
  const sequence = ++requestSequence;
  if (pendingRequest) pendingRequest.abort();
  pendingRequest = new AbortController();
  state.run = null;
  state.entry = entry;
  state.loading = true;
  state.review = emptyReview();
  state.versionCount = 0;
  state.openTurns.clear();
  state.currentTurnIndex = 0;
  resetVisibility();
  renderSelector();
  [els.timeline, els.metricGrid, els.decisionCard, els.referenceGrid, els.integrityDetails].forEach(el => { el.replaceChildren(); });
  els.finalReviewForm.reset();
  els.runTimestamp.textContent = "—";
  els.visibleTurnCount.textContent = "—";
  els.reviewedCount.textContent = "0"; els.flaggedCount.textContent = "0"; els.versionCount.textContent = "0";
  els.railProgressText.textContent = "0 / 0"; els.railProgressBar.style.width = "0%";
  els.loadStatus.textContent = tr("Verifying recorded run…", "저장된 기록 확인 중…");
  els.loadStatus.classList.remove("error");
  setReviewEnabled();
  els.blindToggle.disabled = true;
  els.referenceToggle.disabled = true;
  try {
    const run = await fetchJson(ASSETS + entry.file, entry.file_sha256, pendingRequest.signal);
    if (sequence !== requestSequence) return;
    if (run.id !== entry.id || run.run_sha256 !== entry.run_sha256 || !Array.isArray(run.turns) || run.turns.length !== entry.turns || new Set(run.turns.map(t => t.turn)).size !== entry.turns) throw new Error("Run source binding mismatch.");
    state.run = run;
    state.loading = false;
    restoreDraft();
    resetVisibility();
    renderAll();
    els.blindToggle.disabled = false;
    els.referenceToggle.disabled = false;
    els.loadStatus.textContent = tr("Case24-2009 · Verified record", "Case24-2009 · 기록 확인 완료");
  } catch (error) {
    if (sequence !== requestSequence || error.name === "AbortError") return;
    state.loading = false;
    state.run = null;
    els.loadStatus.textContent = tr("Unable to load: ", "불러오기 실패: ") + error.message;
    els.loadStatus.classList.add("error");
    els.timeline.innerHTML = `<div class="empty-state">${escapeHtml(tr("No run displayed. Retry Load.", "표시할 기록이 없습니다. 다시 불러오세요."))}</div>`;
    setReviewEnabled();
    showToast(error.message, true);
  }
}
function restoreDraft() {
  const ctx = context();
  state.review = emptyReview();
  state.versionCount = 0;
  state.review.reviewer.id = state.activeReviewer;
  if (ctx) {
    try {
      state.review = ramDrafts.has(JSON.stringify(ctx)) ? structuredClone(ramDrafts.get(JSON.stringify(ctx))) : store.loadDraft(ctx);
      state.versionCount = store.listSnapshots(ctx).length;
      if (unsavedContexts.has(JSON.stringify(ctx))) storageMessage(tr("In memory only · Export JSON", "메모리에만 보관 · JSON 내보내기"), true);
      else storageMessage(tr("This browser · Draft restored", "이 브라우저 · 초안 복원"));
    } catch (error) { handleStorageError(error); }
  } else storageMessage(tr("Enter a reviewer ID to begin.", "Reviewer ID를 입력하세요."));
  els.reviewerId.value = state.activeReviewer;
  els.reviewerSpecialty.value = state.review.reviewer.specialty || "";
}
function persistDraft() {
  const ctx = context();
  if (!ctx) return;
  ramDrafts.set(JSON.stringify(ctx), structuredClone(state.review));
  try {
    state.review = store.saveDraft(ctx, state.review);
    unsavedContexts.delete(JSON.stringify(ctx));
    ramDrafts.set(JSON.stringify(ctx), structuredClone(state.review));
    storageMessage(tr("This browser · Draft saved", "이 브라우저 · 초안 저장"));
  } catch (error) { unsavedContexts.add(JSON.stringify(ctx)); handleStorageError(error); }
}
function switchReviewer() {
  const next = els.reviewerId.value.trim();
  if (next === state.activeReviewer) return;
  if (next.length > 120) { showToast(tr("Reviewer ID is too long.", "Reviewer ID가 너무 깁니다."), true); return; }
  const previousWasAnonymous = !state.activeReviewer;
  const history = {...state.review.visibility};
  persistDraft();
  state.activeReviewer = next;
  restoreDraft();
  if (previousWasAnonymous && next) {
    state.review.visibility.model_identity_ever_revealed ||= history.model_identity_ever_revealed;
    state.review.visibility.reference_ever_revealed ||= history.reference_ever_revealed;
  }
  resetVisibility();
  persistDraft();
  renderSelector();
  renderAll();
}

function renderAll() {
  if (!state.run) return;
  renderOverview();
  renderTimeline();
  renderDecision();
  renderReference();
  restoreFinalForm();
  updateProgress();
  els.runTimestamp.textContent = `${tr("Recorded", "기록")} ${formatDate(state.run.started_at)}`;
  els.integrityDetails.innerHTML = `<dt>${tr("Original rollout", "원본 롤아웃")}</dt><dd>${escapeHtml(state.entry.run_sha256)}</dd><dt>${tr("Public view", "공개 데이터")}</dt><dd>${escapeHtml(state.entry.file_sha256)}</dd>`;
  setReviewEnabled();
}

function identityLabel() {
  if (!state.run) return "—";
  return state.revealModel ? state.run.model : state.run.candidate_label;
}

function renderOverview() {
  const reward = state.run.reward || {};
  const penalties = reward.penalties || [];
  const metrics = [
    [tr("Candidate", "후보"), identityLabel(), state.revealModel ? tr("Identity revealed", "모델명 공개") : tr("Identity blinded", "모델명 블라인드"), "is-blue"],
    [tr("Turns", "턴"), state.run.turns.length, `${state.run.visits || 0} ${tr("recorded visits", "기록된 방문")}`, ""],
    [tr("Diagnosis score", "진단 점수"), reward.dx_score ?? "—", tr("Judge score / 5", "자동 평가 / 5"), reward.dx_score >= 4 ? "is-good" : "is-warn"],
    [tr("Reward", "보상"), formatNumber(reward.total, 4), reward.complete ? tr("Recorded evaluation", "저장된 평가") : tr("Incomplete evaluation", "미완료 평가"), reward.total >= 0 ? "is-good" : "is-warn"],
    [tr("Modeled cost", "모형 비용"), `$${formatNumber(state.run.cost_usd, 0)}`, tr("Placeholder encounter prices", "진료 비용 가정값"), ""],
    [tr("Penalties", "감점"), penalties.length, penalties.length ? penalties.map((item) => humanize(item.kind)).join(", ") : tr("No automated flags", "자동 감점 없음"), penalties.length ? "is-warn" : "is-good"],
  ];
  els.metricGrid.innerHTML = metrics.map(([label, value, detail, className]) => `
    <article class="metric-card ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>`).join("");
}

function turnMatches(turn) {
  const review = state.review.turn_reviews[String(turn.turn)] || {};
  if (state.filter === "flagged" && !(["questionable", "unsafe"].includes(review.verdict) || review.issues?.length)) return false;
  if (state.filter === "unreviewed" && review.verdict) return false;
  if (!state.query) return true;
  const haystack = [turn.title, turn.kind, ...turn.exchanges.flatMap((item) => [item.request, item.response, item.provenance])].join(" ").toLowerCase();
  return haystack.includes(state.query.toLowerCase());
}

function renderTimeline() {
  if (!state.run) return;
  const visible = state.run.turns.filter(turnMatches);
  els.visibleTurnCount.textContent = `${visible.length} ${tr("turns", "턴")}`;
  if (!visible.length) {
    els.timeline.innerHTML = `<div class="empty-state">${tr("No matching turns.", "해당 턴 없음.")}</div>`;
    return;
  }
  els.timeline.innerHTML = visible.map(renderTurn).join("");
  setReviewEnabled();
}

function renderTurn(turn) {
  const key = String(turn.turn);
  const review = state.review.turn_reviews[key] || { verdict: "", issues: [], notes: "" };
  const searchable = [turn.title, turn.kind, ...turn.exchanges.flatMap((item) => [item.request, item.response])].join(" ");
  const exchanges = turn.exchanges.length
    ? turn.exchanges.map((exchange) => renderExchange(exchange)).join("")
    : `<div class="exchange"><div class="exchange-label">SUBMISSION</div><div class="exchange-content"><p class="response">${escapeHtml(turn.action?.rationale || turn.title)}</p></div></div>`;
  const verdicts = [["acceptable", tr("Acceptable", "적절")], ["questionable", tr("Questionable", "의문")], ["unsafe", tr("Unsafe", "위험")]];
  const issues = ISSUE_TAGS.map(([value, label]) => `
    <label><input type="checkbox" data-turn="${key}" data-field="issue" value="${value}" ${review.issues?.includes(value) ? "checked" : ""}><span>${label}</span></label>`).join("");
  return `
    <article class="turn-card" id="turn-${key}" data-turn="${key}" data-verdict="${escapeHtml(review.verdict || "")}" data-search="${escapeHtml(searchable.toLowerCase())}">
      <div class="turn-index">${String(turn.turn).padStart(2, "0")}</div>
      <details class="turn-body" ${state.openTurns.get(key) === false ? "" : "open"}>
        <summary>
          <div class="turn-summary-title"><span>${escapeHtml(humanize(turn.kind))}</span><h3>${escapeHtml(turn.title)}</h3></div>
          <div class="turn-meta"><span class="route-badge">${escapeHtml(turn.accepted ? "ACCEPTED" : "REJECTED")}</span><span class="turn-cost">$${formatNumber(turn.turn_cost_usd, 0)}</span></div>
        </summary>
        <div class="turn-content">${exchanges}</div>
        ${turn.error ? `<p class="turn-error">${escapeHtml(turn.error)}</p>` : ""}
        <details class="recorded-detail"><summary>${tr("Original action", "원본 행동")}</summary><pre>${escapeHtml(JSON.stringify(turn.action, null, 2))}</pre></details>
        <div class="turn-review">
          <fieldset><legend>${tr("Clinical appropriateness", "임상적 적절성")}</legend><div class="choice-grid">
            ${verdicts.map(([value, label]) => `<label><input type="radio" name="verdict-${key}" data-turn="${key}" data-field="verdict" value="${value}" ${review.verdict === value ? "checked" : ""}><span>${label}</span></label>`).join("")}
          </div></fieldset>
          <fieldset><legend>${tr("Issue tags", "문제 태그")}</legend><div class="issue-tags">${issues}</div></fieldset>
          <label>${tr("Turn notes", "턴 메모")}<textarea rows="3" maxlength="12000" data-turn="${key}" data-field="notes" placeholder="${tr("Evidence for your assessment.", "판단 근거를 기록하세요.")}">${escapeHtml(review.notes || "")}</textarea></label>
        </div>
      </details>
    </article>`;
}

function renderExchange(exchange) {
  const sources = (exchange.sources || []).map((source) => {
    const pages = (source.pages || []).length ? ` · p${source.pages.join(",")}` : "";
    return `<span class="source-chip" title="${escapeHtml(source.label || source.id)}">${escapeHtml(source.id)}${escapeHtml(pages)}</span>`;
  }).join("");
  const evidence = (exchange.sources || []).map(source => `<li><b>${escapeHtml(source.id)} · ${escapeHtml(source.kind)} · p${escapeHtml((source.pages || []).join(","))}</b><p>${escapeHtml(source.label || "")}</p>${source.result ? `<p>${escapeHtml(source.result)}</p>` : ""}</li>`).join("");
  const detail = `<details class="source-detail"><summary>${tr("Source details", "출처 상세")}</summary>${evidence ? `<ul>${evidence}</ul>` : `<p>${tr("No source fact/finding IDs", "원문 fact/finding ID 없음")}</p>`}${exchange.notes?.length ? `<pre>${escapeHtml(JSON.stringify(exchange.notes, null, 2))}</pre>` : ""}</details>`;
  const generated = exchange.generated_text
    ? `<div class="source-popover"><b>${tr("Generated component", "생성된 내용")}</b><br>${escapeHtml(exchange.generated_text)}</div>`
    : "";
  return `<div class="exchange">
    <div class="exchange-label">${escapeHtml(humanize(exchange.route))}</div>
    <div class="exchange-content">
      <p class="request">${escapeHtml(exchange.request)}</p>
      <p class="response">${escapeHtml(exchange.response)}</p>
      <div class="exchange-footer"><span class="provenance-badge" data-provenance="${escapeHtml(exchange.provenance)}">${escapeHtml(exchange.provenance || "unknown")}</span>${sources}</div>
      ${generated}${detail}
    </div>
  </div>`;
}

function renderDecision() {
  const reward = state.run.reward || {};
  const penalties = reward.penalties || [];
  const penaltyHtml = penalties.length
    ? penalties.map((item) => `<div class="penalty-item"><b>${escapeHtml(humanize(item.kind))}</b><span>−${formatNumber(item.penalty, 2)}</span></div>`).join("")
    : '<div class="penalty-item"><b>No automated penalties</b><span>0.00</span></div>';
  els.decisionCard.innerHTML = `
    <h3>${tr("MODEL SUBMISSION", "모델의 최종 진단")}</h3>
    <p class="diagnosis-text">${escapeHtml(state.run.final?.diagnosis || "No diagnosis submitted")}</p>
    <h3>${tr("RATIONALE · ORIGINAL TEXT", "판단 근거 · 원문")}</h3>
    <div class="rationale-box">${escapeHtml(state.run.final?.rationale || "No rationale recorded.")}</div>
    <div class="reward-strip">
      <div><span>DX TERM</span><strong>${formatNumber(reward.dx_term, 3)}</strong></div>
      <div><span>COST</span><strong>−${formatNumber(reward.cost_term, 3)}</strong></div>
      <div><span>PENALTY</span><strong>−${formatNumber(reward.penalty_total, 3)}</strong></div>
      <div><span>TOTAL</span><strong>${formatNumber(reward.total, 3)}</strong></div>
    </div>
    <div class="penalty-list">${penaltyHtml}</div>
    <details class="recorded-detail"><summary>${tr("Judge rationale · Original text", "Judge 근거 · 원문")}</summary><pre>${escapeHtml(JSON.stringify(state.run.final?.judgement || {}, null, 2))}</pre></details>
    <details class="recorded-detail"><summary>${tr("Penalty evidence · Original text", "감점 근거 · 원문")}</summary><pre>${escapeHtml(JSON.stringify(penalties, null, 2))}</pre></details>`;
}

function renderReference() {
  if (!state.revealReference) {
    els.referenceGrid.innerHTML = `<div class="reference-locked">${tr("Reference diagnosis hidden · Reveal to inspect", "원문 진단 숨김 · 버튼으로 확인")}</div>`;
    return;
  }
  const caseData = state.run.case || {};
  const cards = [
    [tr("REFERENCE DIAGNOSIS", "원문 진단"), caseData.reference_diagnosis || "—", (caseData.accepted_diagnoses || []).join(" · ")],
    [tr("SOURCE", "출처"), caseData.citation || "Case report", caseData.doi ? `DOI ${caseData.doi}` : ""],
    [tr("EVIDENCE UNITS", "근거 항목"), `${state.run.source_counts?.history || 0} history · ${state.run.source_counts?.findings || 0} findings`, tr("Core: configured evidence", "Core: 설정된 원문 근거")],
  ];
  els.referenceGrid.innerHTML = cards.map(([label, title, copy]) => `<article class="reference-card"><span>${escapeHtml(label)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></article>`).join("");
}

function updateTurnReview(turn, field, value, checked = false) {
  if (!context()) return;
  const key = String(turn);
  const review = state.review.turn_reviews[key] || { verdict: "", issues: [], notes: "" };
  if (field === "issue") {
    const issues = new Set(review.issues || []);
    checked ? issues.add(value) : issues.delete(value);
    review.issues = [...issues];
  } else {
    review[field] = value;
  }
  state.review.turn_reviews[key] = review;
  persistDraft();
  const card = document.querySelector(`.turn-card[data-turn="${CSS.escape(key)}"]`);
  if (card && field === "verdict") card.dataset.verdict = value;
  updateProgress();
  if (state.filter !== "all" && ["verdict", "issue"].includes(field)) renderTimeline();
}

function updateProgress() {
  if (!state.run) return;
  const reviews = Object.values(state.review.turn_reviews || {});
  const reviewed = reviews.filter((item) => item.verdict).length;
  const flagged = reviews.filter((item) => ["questionable", "unsafe"].includes(item.verdict) || item.issues?.length).length;
  const total = state.run.turns.length;
  els.reviewedCount.textContent = reviewed;
  els.flaggedCount.textContent = flagged;
  els.versionCount.textContent = state.versionCount || 0;
  els.railProgressText.textContent = `${reviewed} / ${total}`;
  els.railProgressBar.style.width = total ? `${(reviewed / total) * 100}%` : "0%";
}

function collectFinalReview() {
  const form = new FormData(els.finalReviewForm);
  return {
    diagnosis_agreement: form.get("diagnosis_agreement") || "",
    penalty_agreement: form.get("penalty_agreement") || "",
    overall_verdict: form.get("overall_verdict") || "",
    notes: form.get("notes") || "",
  };
}

function restoreFinalForm() {
  const review = state.review.final_review || {};
  els.finalReviewForm.reset();
  for (const [name, value] of Object.entries(review)) {
    const field = els.finalReviewForm.elements.namedItem(name);
    if (!field) continue;
    if (field instanceof RadioNodeList) field.value = value;
    else field.value = value;
  }
}

function requireContext() {
  const requestedReviewer = els.reviewerId.value.trim();
  switchReviewer();
  if (requestedReviewer !== state.activeReviewer) return null;
  if (context()) return context();
  els.reviewerId.focus();
  showToast(tr("Enter a reviewer ID first.", "Reviewer ID를 먼저 입력하세요."), true);
  return null;
}
function saveReview() {
  const ctx = requireContext();
  if (!ctx) return;
  state.review.final_review = collectFinalReview();
  try {
    const result = store.saveSnapshot(ctx, state.review);
    state.versionCount = store.listSnapshots(ctx).length;
    persistDraft();
    updateProgress();
    const message = `${tr("Snapshot saved in this browser", "이 브라우저에 스냅샷 저장")} · ${formatDate(result.snapshot.saved_at)}`;
    storageMessage(message);
    showToast(message);
  } catch (error) { handleStorageError(error); }
}
function resumeLatest() {
  const ctx = requireContext();
  if (!ctx) return;
  try {
    const snapshot = store.resumeLatest(ctx);
    if (!snapshot) { showToast(tr("No saved snapshot for this reviewer.", "저장된 스냅샷이 없습니다.")); return; }
    const ever = {...state.review.visibility};
    state.review = store.snapshotToDraft(ctx, snapshot);
    state.review.visibility.model_identity_ever_revealed ||= ever.model_identity_ever_revealed;
    state.review.visibility.reference_ever_revealed ||= ever.reference_ever_revealed;
    state.versionCount = store.listSnapshots(ctx).length;
    els.reviewerSpecialty.value = state.review.reviewer.specialty || "";
    resetVisibility();
    persistDraft();
    renderSelector();
    renderAll();
    showToast(tr("Latest snapshot restored.", "최신 스냅샷 복원 완료."));
  } catch (error) { handleStorageError(error); }
}
function exportReview() {
  const ctx = requireContext();
  if (!ctx) return;
  state.review.final_review = collectFinalReview();
  try {
    const json = store.exportSnapshot(ctx, state.review);
    const url = URL.createObjectURL(new Blob([json], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `case2rl-review-${state.entry.candidate_label.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(tr("Review JSON exported.", "검토 JSON 내보내기 완료."));
  } catch (error) { handleStorageError(error); }
}
async function importReview(file) {
  const ctx = requireContext();
  if (!ctx || !file) return;
  const binding = JSON.stringify(ctx);
  if (file.size > window.Case2RLReviewStore.maxImportBytes) { showToast(tr("Review file exceeds 1 MiB.", "검토 파일은 1 MiB 이하여야 합니다."), true); return; }
  try {
    const json = await file.text();
    if (JSON.stringify(context()) !== binding) throw new Error(tr("Reviewer or run changed. Import again.", "검토자 또는 롤아웃이 변경되었습니다."));
    const result = store.importSnapshot(ctx, json);
    const ever = {...state.review.visibility};
    state.review = store.snapshotToDraft(ctx, result.snapshot);
    state.review.visibility.model_identity_ever_revealed ||= ever.model_identity_ever_revealed;
    state.review.visibility.reference_ever_revealed ||= ever.reference_ever_revealed;
    state.versionCount = store.listSnapshots(ctx).length;
    els.reviewerSpecialty.value = state.review.reviewer.specialty || "";
    resetVisibility();
    persistDraft();
    renderSelector();
    renderAll();
    showToast(tr("Review imported for this reviewer and run.", "이 검토자·롤아웃의 검토를 가져왔습니다."));
  } catch (error) { handleStorageError(error); }
}
function scrollToCard(card) {
  card?.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center"});
}

function firstUnreviewed() {
  if (!state.run) return;
  const target = state.run.turns.find((turn) => !state.review.turn_reviews[String(turn.turn)]?.verdict) || state.run.turns[0];
  state.filter = "all"; state.query = ""; els.searchInput.value = "";
  document.querySelectorAll("[data-filter]").forEach(button => { button.classList.toggle("active", button.dataset.filter === "all"); button.setAttribute("aria-pressed", String(button.dataset.filter === "all")); });
  renderTimeline();
  scrollToCard(document.querySelector(`#turn-${CSS.escape(String(target.turn))}`));
}

function moveTurn(delta) {
  const cards = [...document.querySelectorAll(".turn-card:not(.is-hidden)")];
  if (!cards.length) return;
  const center = innerHeight / 2;
  const rects = cards.map(card => card.getBoundingClientRect());
  let nearest = 0, distance = Infinity;
  rects.forEach((rect, index) => {
    const gap = center >= rect.top && center <= rect.bottom ? 0 : Math.min(Math.abs(rect.top-center), Math.abs(rect.bottom-center));
    if (gap < distance) { nearest = index; distance = gap; }
  });
  const outside = rects[0].top > innerHeight ? 0 : rects[rects.length-1].bottom < 0 ? cards.length-1 : null;
  state.currentTurnIndex = outside ?? Math.max(0, Math.min(cards.length-1, nearest+delta));
  scrollToCard(cards[state.currentTurnIndex]);
}

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle("error", error);
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3600);
}

function initNetwork() {
  const canvas = document.querySelector("#networkCanvas");
  const ctx = canvas.getContext("2d");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let inView = true;
  let points = [];
  let frame = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(34, Math.floor(rect.width / 24));
    points = Array.from({ length: count }, (_, index) => ({
      x: ((index * 83) % 997) / 997 * rect.width,
      y: ((index * 149 + 31) % 991) / 991 * rect.height,
      phase: index * .63,
    }));
  }
  function draw(time = 0) {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const animated = motion.matches ? 0 : time * .00015;
    const current = points.map((point) => ({
      x: point.x + Math.sin(point.phase + animated) * 7,
      y: point.y + Math.cos(point.phase * .7 + animated) * 5,
    }));
    ctx.lineWidth = 1;
    for (let i = 0; i < current.length; i += 1) {
      for (let j = i + 1; j < current.length; j += 1) {
        const dx = current[i].x - current[j].x;
        const dy = current[i].y - current[j].y;
        const distance = Math.hypot(dx, dy);
        if (distance < 170) {
          ctx.strokeStyle = `rgba(116, 157, 177, ${Math.max(0, .25 - distance / 820)})`;
          ctx.beginPath();
          ctx.moveTo(current[i].x, current[i].y);
          ctx.lineTo(current[j].x, current[j].y);
          ctx.stroke();
        }
      }
    }
    current.forEach((point, index) => {
      const size = index % 7 === 0 ? 5 : 3;
      ctx.fillStyle = index % 9 === 0 ? "#1e91f5" : "#718b99";
      ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    });
    frame = !motion.matches && !document.hidden && inView ? requestAnimationFrame(draw) : 0;
  }
  resize();
  draw();
  function refresh() { cancelAnimationFrame(frame); resize(); draw(); }
  window.addEventListener("resize", refresh);
  document.addEventListener("visibilitychange", refresh);
  motion.addEventListener("change", refresh);
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; refresh(); }).observe(canvas);
}

function setMenu(open, returnFocus = false) {
  const mobile = matchMedia("(max-width: 1024px)").matches;
  const showing = mobile && open;
  els.sideRail.classList.toggle("open", showing);
  els.sideRail.inert = mobile && !showing;
  els.menuButton.setAttribute("aria-expanded", String(showing));
  els.menuBackdrop.hidden = !showing;
  if (showing) els.sideRail.querySelector("a")?.focus();
  else if (returnFocus) els.menuButton.focus();
}
function bindEvents() {
  els.loadRunButton.addEventListener("click", () => loadRun(Number(els.runSelect.value)));
  els.runSelect.addEventListener("change", () => loadRun(Number(els.runSelect.value)));
  els.searchInput.addEventListener("input", event => { state.query = event.target.value.trim(); renderTimeline(); });
  document.querySelectorAll("[data-filter]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(item => { item.classList.toggle("active", item === button); item.setAttribute("aria-pressed", String(item === button)); });
      renderTimeline();
    });
  });
  els.timeline.addEventListener("toggle", event => {
    if (event.target.matches("details.turn-body")) state.openTurns.set(event.target.closest(".turn-card").dataset.turn, event.target.open);
  }, true);
  els.timeline.addEventListener("change", event => {
    const target = event.target;
    if (target.dataset.turn && target.dataset.field !== "notes") updateTurnReview(target.dataset.turn, target.dataset.field, target.value, target.checked);
  });
  els.timeline.addEventListener("input", event => {
    const target = event.target;
    if (target.dataset.field === "notes") updateTurnReview(target.dataset.turn, "notes", target.value);
  });
  els.finalReviewForm.addEventListener("submit", event => event.preventDefault());
  els.finalReviewForm.addEventListener("input", () => { if (!context()) return; state.review.final_review = collectFinalReview(); persistDraft(); });
  els.reviewerId.addEventListener("change", switchReviewer);
  els.reviewerId.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); switchReviewer(); } });
  els.reviewerSpecialty.addEventListener("input", () => { if (!context()) return; state.review.reviewer.specialty = els.reviewerSpecialty.value; persistDraft(); });
  document.querySelectorAll("#saveButton, #footerSaveButton").forEach(button => button.addEventListener("click", saveReview));
  document.querySelector("#resumeButton").addEventListener("click", resumeLatest);
  document.querySelector("#exportButton").addEventListener("click", exportReview);
  document.querySelector("#importButton").addEventListener("click", () => { if (requireContext()) document.querySelector("#importFile").click(); });
  document.querySelector("#importFile").addEventListener("change", event => { importReview(event.target.files[0]); event.target.value = ""; });
  document.querySelector("#nextUnreviewedButton").addEventListener("click", firstUnreviewed);
  els.blindToggle.addEventListener("click", () => {
    if (!state.run) return;
    state.revealModel = !state.revealModel;
    state.review.visibility.model_identity_visible = state.revealModel;
    state.review.visibility.model_identity_ever_revealed ||= state.revealModel;
    persistDraft();
    syncVisibilityControls();
    renderSelector();
    renderOverview();
  });
  els.referenceToggle.addEventListener("click", () => {
    if (!state.run) return;
    state.revealReference = !state.revealReference;
    state.review.visibility.reference_visible = state.revealReference;
    state.review.visibility.reference_ever_revealed ||= state.revealReference;
    persistDraft();
    syncVisibilityControls();
    renderReference();
  });
  els.menuButton.addEventListener("click", () => setMenu(!els.sideRail.classList.contains("open"), els.sideRail.classList.contains("open")));
  els.menuBackdrop.addEventListener("click", () => setMenu(false, true));
  document.querySelectorAll(".rail-nav a").forEach(link => link.addEventListener("click", () => setMenu(false, true)));
  matchMedia("(max-width: 1024px)").addEventListener("change", () => setMenu(false));
  setMenu(false);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && els.sideRail.classList.contains("open")) { setMenu(false, true); return; }
    if (event.key === "Tab" && els.sideRail.classList.contains("open")) {
      const nodes = [els.menuButton, ...els.sideRail.querySelectorAll('a, input, summary, button')].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    if (event.key.toLowerCase() === "j") { event.preventDefault(); moveTurn(1); }
    if (event.key.toLowerCase() === "k") { event.preventDefault(); moveTurn(-1); }
    if (event.key.toLowerCase() === "s") { event.preventDefault(); saveReview(); }
  });
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    document.querySelectorAll(".rail-nav a").forEach(link => link.classList.toggle("active", link.dataset.nav === entry.target.id));
  }), {rootMargin: "-25% 0px -65%", threshold: 0});
  document.querySelectorAll("main > section[id]").forEach(section => observer.observe(section));
  window.addEventListener("pagehide", persistDraft);
}
bindEvents();
initNetwork();
loadRuns();
