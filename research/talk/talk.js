// TALK playground: pick a group of real cells and replay what each trained model answered.
// All answers come from data/talk-demo.json (recorded runs, built by tools/make_talk_demo.py); nothing runs a model here.
(() => {
  const root = document.querySelector("[data-talk]");
  if (!root) return;
  const ko = document.documentElement.lang === "ko";
  const $ = (sel) => root.querySelector(sel);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const TYPE_COLOR = { B: "#3AA0FF", CD14_MONO: "#1FD1A0", CD4_T: "#FF8A3D", NK: "#E58BFF" };
  const STRATUM_TYPE = { b: "B", cd14: "CD14_MONO", cd4: "CD4_T", nk: "NK" };
  const TYPE_KEY = { B: "b", CD14_MONO: "cd14_mono", CD4_T: "cd4_t", NK: "nk" };
  const TYPE_NAME = ko
    ? { B: "B 세포", CD4_T: "CD4 T 세포", CD8_T: "CD8 T 세포", CD14_MONO: "CD14 단핵구", CD16_MONO: "CD16 단핵구", NK: "NK 세포" }
    : { B: "B cell", CD4_T: "CD4 T cell", CD8_T: "CD8 T cell", CD14_MONO: "CD14 monocyte", CD16_MONO: "CD16 monocyte", NK: "NK cell" };
  const STATE_NAME = ko ? { CTRL: "대조군", STIM: "IFN-β 자극" } : { CTRL: "Control", STIM: "IFN-β stimulated" };
  const MODEL_NAME = ko ? { SFT: "지도학습", GRPO: "GRPO", DAPO: "DAPO" } : { SFT: "Fine-tuned", GRPO: "GRPO", DAPO: "DAPO" };
  const T = ko
    ? {
        loading: "기록된 답변을 불러오는 중…",
        failed: "데이터를 불러오지 못했습니다.",
        cells: (n) => `세포 ${n}개`,
        codes: "유형·조건 코드와 출력 형식",
        single: "평가에서는 세포 개수와 상관없이 이 문구를 그대로 썼습니다. 세포 1개일 때도 “These profiles”입니다.",
        verbatim: "평가에서 쓴 프롬프트 원문입니다.",
        reasoning: (tok, sec) => `추론 과정 · ${tok.toLocaleString()} 토큰 · ${sec}초`,
        type: "유형",
        state: "조건",
        none: "최종 답 없음 (추론이 끝나지 않음)",
        truth: (t, s) => `정답: ${t} · ${s}`,

        run: "기록된 실행 · 온도 0.6 · 그룹마다 고정된 시드 하나",
      }
    : {
        loading: "Loading the recorded answers…",
        failed: "Could not load the recorded answers.",
        cells: (n) => `${n} cell${n > 1 ? "s" : ""}`,
        codes: "Type and state codes, and the output format",
        single: "The evaluation used this same wording for every group size, so a single cell still reads “These profiles”.",
        verbatim: "The prompt text is the evaluation’s own wording, shown unchanged.",
        reasoning: (tok, sec) => `Reasoning · ${tok.toLocaleString()} tokens · ${sec} s`,
        type: "Type",
        state: "Condition",
        none: "No final answer (the reasoning did not finish)",
        truth: (t, s) => `Truth: ${t} · ${s}`,

        run: "Recorded run · temperature 0.6 · one fixed seed per group",
      };

  const G = ko ? {
    verdict: { correct: "맞음", incorrect: "틀림", rank_mismatch: "순위 틀림", unscored: "미채점" },
    kind: { rank: "발현 순위", absent: "발현 없음", present: "발현 있음", majority: "과반수에서 검출", minority: "절반 이하에서 검출", log2cpm: "log2(CPM)", low_support: "낮은 raw count", corpus: "Corpus 대비 발현", context: "문맥상 언급" },
    reason: {
      match: "언급한 내용과 측정값이 일치합니다.",
      detection_mismatch: "발현 여부가 언급한 내용과 다릅니다.",
      rank_mismatch: "발현은 있지만 언급한 순위 범위 밖입니다.",
      tie_overlap: "동점 순위가 주장한 구간과 겹쳐 맞음으로 처리합니다.",
      missing_gene: "유전자 매핑 또는 측정값을 확인할 수 없습니다.",
      context_only: "유전자 언급만으로 검증할 주장이 정해지지 않습니다.",
      corpus_unavailable: "Corpus 비교는 이번 채점에 포함하지 않습니다.",
      low_support_unavailable: "낮은 발현에 대한 주장을 확인할 근거가 부족합니다.",
      low_support_mismatch: "Raw count가 언급한 낮은 발현 범위와 다릅니다.",
      unsupported_claim: "이 주장은 현재 데이터로 채점할 수 없습니다.",
      numeric_mismatch: "언급한 수치와 측정값이 다릅니다.",
      cell_count_mismatch: "언급한 세포 범위를 특정할 수 없어 판정을 보류합니다.",
    },
    unavailable: "Gene 채점 불가 · 기록과 채점 데이터를 확인할 수 없습니다.",
    noMentions: "채점할 gene 언급 없음",
    summary: (n) => `Gene 언급 ${n}회`,
    inspect: "근거 보기", close: "닫기", evidence: "Gene 채점 근거", claim: "LLM 주장", observed: "측정값",
    presence: "검출", raw: "Raw UMI · 합계", rank: "실제 순위", tier: "구간", missing: "데이터 없음", notDetected: "미검출", noRank: "—",
    counts: (k, n) => `${k} / ${n} cells`, top: (n) => `상위 ${n}%`, range: (a, b) => `상위 ${a}–${b}%`,
    rankNote: "선택한 세포의 raw count 합계 기준입니다. 동점 범위가 주장한 구간과 겹치면 맞음으로 처리합니다.",
  } : {
    verdict: { correct: "Correct", incorrect: "Wrong", rank_mismatch: "Rank wrong", unscored: "Not graded" },
    kind: { rank: "Expression rank", absent: "Not expressed", present: "Expressed", majority: "Detected in most cells", minority: "Detected in half or fewer", log2cpm: "log2(CPM)", low_support: "Low raw count", corpus: "Corpus comparison", context: "Context only" },
    reason: {
      match: "The claim matches the measured expression.",
      detection_mismatch: "The claim disagrees with whether the gene was detected.",
      rank_mismatch: "The gene is expressed, but outside the claimed rank range.",
      tie_overlap: "The tied rank range overlaps the claimed band, so the claim is accepted.",
      missing_gene: "The gene mapping or measurement is unavailable.",
      context_only: "This mention does not make a testable expression claim.",
      corpus_unavailable: "Corpus comparisons are not included in this grading.",
      low_support_unavailable: "There is not enough evidence to check this low-expression claim.",
      low_support_mismatch: "The raw count falls outside the claimed low-expression range.",
      unsupported_claim: "This claim cannot be graded from these measurements.",
      numeric_mismatch: "The claimed number does not match the measurement.",
      cell_count_mismatch: "The claimed cell subset cannot be identified; no verdict.",
    },
    unavailable: "Gene grading unavailable · the recorded answer and grading data could not be verified.",
    noMentions: "No gene mentions to grade",
    summary: (n) => `${n} gene mentions`,
    inspect: "Inspect evidence", close: "Close", evidence: "Gene claim evidence", claim: "LLM claim", observed: "Measured",
    presence: "Detected", raw: "Raw UMI · total", rank: "Actual rank", tier: "Tier", missing: "No data", notDetected: "Not detected", noRank: "—",
    counts: (k, n) => `${k} / ${n} cells`, top: (n) => `Top ${n}%`, range: (a, b) => `Top ${a}–${b}%`,
    rankNote: "Ranked among detected genes by summed raw counts. A tied range overlapping the claimed band is accepted.",
  };
  const VERDICTS = ["correct", "incorrect", "rank_mismatch", "unscored"];
  let D = null;
  let claims = null;
  let selectedMention = null;
  const S = { type: "B", state: "CTRL", n: 8, model: "SFT" };
  let typing = 0;

  function segment(field, options) {
    const box = $(`[data-pick="${field}"]`);
    box.innerHTML = "";
    for (const [value, label, color] of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.value = value;
      b.innerHTML = (color ? `<i style="--c:${color}"></i>` : "") + label;
      b.addEventListener("click", () => {
        S[field] = field === "n" ? Number(value) : value;
        render();
      });
      box.append(b);
    }
  }

  function syncButtons() {
    root.querySelectorAll("[data-pick]").forEach((box) => {
      box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === String(S[box.dataset.pick]))));
    });
  }

  function key() {
    return `${TYPE_KEY[S.type]}_${S.state.toLowerCase()}`;
  }

  function drawMap(selected) {
    const canvas = $(".talk-map canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 24, r: 24, t: 20, b: 20 };
    const X = (x) => pad.l + x * (w - pad.l - pad.r);
    const Y = (y) => h - pad.b - y * (h - pad.t - pad.b);
    const chosen = new Set(selected);
    const r = Math.max(3, w / 150);
    D.cells.forEach((c, i) => {
      if (chosen.has(i)) return;
      const color = TYPE_COLOR[STRATUM_TYPE[c.s.split("_")[0]]];
      ctx.globalAlpha = 0.28;
      dot(ctx, X(c.x), Y(c.y), r, color, c.s.endsWith("stim"));
    });
    ctx.globalAlpha = 1;
    selected.forEach((i) => {
      const c = D.cells[i];
      const color = TYPE_COLOR[STRATUM_TYPE[c.s.split("_")[0]]];
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.arc(X(c.x), Y(c.y), r * 2.3, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, X(c.x), Y(c.y), r * 1.35, color, c.s.endsWith("stim"));
    });
  }

  function dot(ctx, x, y, r, color, ring) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (ring) {
      ctx.lineWidth = Math.max(1.5, r * 0.45);
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function renderPrompt(group) {
    const color = TYPE_COLOR[S.type];
    const n = group.cells.length;
    const shown = Math.min(n, 8);
    let tokens = "";
    for (let i = 0; i < shown; i += 1) tokens += `${i ? " " : ""}Cell ${i + 1}: <i class="rna-token" style="--c:${color}" aria-hidden="true"></i>`;
    if (n > shown) tokens += ` … Cell ${n}: <i class="rna-token" style="--c:${color}" aria-hidden="true"></i>`;
    // The prompt text is the evaluation's own wording; only the cell lines change with the group size.
    const [lead, codes] = splitInstruction(D.prompt.instruction);
    $(".talk-prompt").innerHTML =
      `<span class="talk-head">${D.prompt.header}</span><span class="talk-tokens">${tokens}</span>${lead}` +
      `<details class="talk-codes"><summary>${T.codes}</summary><p>${codes}</p></details>`;
    $(".talk-prompt-count").textContent = T.cells(n);
    $(".talk-prompt-note").textContent = n === 1 ? T.single : T.verbatim;
  }

  function splitInstruction(text) {
    const cut = text.indexOf("Type codes:");
    return cut < 0 ? [text, ""] : [text.slice(0, cut).trim(), text.slice(cut).trim()];
  }

  function renderPanel(group) {
    const max = Math.max(3, ...group.panel);
    const color = TYPE_COLOR[S.type];
    $(".talk-bars").innerHTML = D.panel
      .map((g, i) => {
        const v = group.panel[i];
        return `<div class="talk-bar"><span>${g}<em>${v.toFixed(1)}</em></span><i style="--c:${color};--w:${((100 * v) / max).toFixed(1)}%"></i></div>`;
      })
      .join("");
  }

  function textElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  function percent(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)).toLocaleString(ko ? "ko-KR" : "en-US") : "—";
  }

  function rankText(evidence) {
    if (evidence.detected_cells === 0) return G.notDetected;
    const interval = evidence.rank_interval;
    if (Array.isArray(interval) && interval.length === 2 && interval.every(Number.isFinite)) {
      return interval[0] === interval[1] ? G.top(percent(interval[0])) : G.range(percent(interval[0]), percent(interval[1]));
    }
    return Number.isFinite(evidence.rank_pct) ? G.top(percent(evidence.rank_pct)) : G.noRank;
  }

  function rankTier(evidence) {
    const tier = (p) => p <= 3 + 1e-5 ? G.top("3") : p <= 10 + 1e-5 ? G.range("3", "10") : p <= 25 + 1e-5 ? G.range("10", "25") : G.range("25", "100");
    const interval = evidence.rank_interval;
    if (evidence.detected_cells === 0) return G.noRank;
    if (Array.isArray(interval) && interval.every(Number.isFinite)) {
      const first = tier(interval[0]);
      const last = tier(interval[1]);
      return first === last ? first : `${first} / ${last}`;
    }
    return Number.isFinite(evidence.rank_pct) ? tier(evidence.rank_pct) : G.noRank;
  }

  function claimText(mention) {
    const parts = [G.kind[mention.kind] || G.kind.context];
    if (Array.isArray(mention.range)) parts.push(mention.kind === "rank" ? (mention.range[0] === 0 ? G.top(percent(mention.range[1])) : G.range(percent(mention.range[0]), percent(mention.range[1]))) : `${percent(mention.range[0])}–${percent(mention.range[1])}`);
    else if (mention.expected) parts.push(mention.expected);
    else if (Number.isFinite(mention.value)) parts.push(String(mention.value));
    else if (mention.kind === "low_support") parts.push("1–3 UMI");
    return parts.join(" · ");
  }

  function closeEvidence(restoreFocus = false) {
    const card = $(".talk-gene-evidence");
    card.hidden = true;
    if (selectedMention) {
      selectedMention.setAttribute("aria-expanded", "false");
      if (restoreFocus) selectedMention.focus();
    }
    selectedMention = null;
  }

  function showEvidence(mention, button) {
    if (selectedMention === button) return closeEvidence();
    closeEvidence();
    selectedMention = button;
    button.setAttribute("aria-expanded", "true");
    const card = $(".talk-gene-evidence");
    card.replaceChildren();
    card.dataset.verdict = mention.status;
    const heading = textElement("div", "talk-evidence-heading", "");
    heading.append(textElement("strong", "", mention.gene), textElement("span", `talk-verdict ${mention.status}`, G.verdict[mention.status]));
    const close = textElement("button", "talk-evidence-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", G.close);
    close.addEventListener("click", () => closeEvidence(true));
    heading.append(close);
    card.append(heading, textElement("p", "talk-evidence-claim", `${G.claim} · ${claimText(mention)}`));
    card.append(textElement("blockquote", "talk-evidence-context", mention.context));
    const evidence = mention.evidence || {};
    const list = textElement("dl", "talk-evidence-values", "");
    const values = [
      [G.presence, Number.isFinite(evidence.detected_cells) && Number.isFinite(evidence.total_cells) ? G.counts(evidence.detected_cells, evidence.total_cells) : G.missing],
      [G.raw, Number.isFinite(evidence.raw_count) ? evidence.raw_count.toLocaleString(ko ? "ko-KR" : "en-US") : G.missing],
      [G.rank, rankText(evidence)],
      [G.tier, rankTier(evidence)],
    ];
    if (mention.kind === "log2cpm") values.push(["log₂(1 + CPM)", Number.isFinite(evidence.log2cpm) ? percent(evidence.log2cpm) : G.missing]);
    for (const [label, value] of values) {
      const item = document.createElement("div");
      item.append(textElement("dt", "", label), textElement("dd", "", value));
      list.append(item);
    }
    card.append(list, textElement("p", "talk-evidence-reason", G.reason[mention.reason] || G.reason.unsupported_claim));
    card.append(textElement("p", "talk-evidence-note", G.rankNote));
    card.hidden = false;
  }

  function reasoningNodes(text, mentions) {
    if (!mentions) return [document.createTextNode(text)];
    const nodes = [];
    let cursor = 0;
    mentions.forEach((mention, index) => {
      nodes.push(document.createTextNode(text.slice(cursor, mention.start)));
      const button = textElement("button", `talk-gene-mention ${mention.status}`, mention.gene);
      button.type = "button";
      button.dataset.geneMention = String(index);
      button.dataset.verdict = mention.status;
      button.dataset.gene = mention.gene;
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", "talk-gene-evidence");
      button.setAttribute("aria-label", `${mention.gene} · ${G.verdict[mention.status]} · ${claimText(mention)} · ${G.inspect}`);
      button.title = `${G.verdict[mention.status]} · ${claimText(mention)} · ${G.reason[mention.reason] || G.reason.unsupported_claim}`;
      button.addEventListener("click", () => showEvidence(mention, button));
      nodes.push(button);
      cursor = mention.end;
    });
    nodes.push(document.createTextNode(text.slice(cursor)));
    return nodes;
  }

  function renderGeneSummary(mentions) {
    const summary = $(".talk-gene-summary");
    summary.replaceChildren();
    if (!mentions) {
      summary.dataset.state = "unavailable";
      summary.textContent = G.unavailable;
      return;
    }
    summary.dataset.state = "ready";
    if (!mentions.length) {
      summary.textContent = G.noMentions;
      return;
    }
    summary.append(textElement("span", "talk-mention-count", G.summary(mentions.length)));
    for (const verdict of VERDICTS) {
      const count = mentions.filter((mention) => mention.status === verdict).length;
      const chip = textElement("span", `talk-verdict ${verdict}`, `${G.verdict[verdict]} ${count}`);
      chip.dataset.count = String(count);
      chip.dataset.verdict = verdict;
      summary.append(chip);
    }
  }

  async function sha256(bytes) {
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function verifiedClaims(data, sourceBytes, annotations) {
    if (!annotations || annotations.source_sha256 !== await sha256(sourceBytes)) return null;
    const valid = {};
    await Promise.all(Object.entries(data.answers).map(async ([answerKey, answer]) => {
      const entry = annotations.answers?.[answerKey];
      if (!entry || entry.reasoning_sha256 !== await sha256(new TextEncoder().encode(answer.reasoning)) || !Array.isArray(entry.mentions)) return;
      let cursor = 0;
      for (const mention of entry.mentions) {
        if (!Number.isInteger(mention.start) || !Number.isInteger(mention.end) || mention.start < cursor || mention.end <= mention.start || mention.end > answer.reasoning.length || answer.reasoning.slice(mention.start, mention.end) !== mention.gene || !VERDICTS.includes(mention.status) || !(mention.kind in G.kind) || !(mention.reason in G.reason) || typeof mention.context !== "string" || (mention.evidence !== null && (typeof mention.evidence !== "object" || Array.isArray(mention.evidence)))) return;
        cursor = mention.end;
      }
      valid[answerKey] = entry.mentions;
    }));
    return valid;
  }

  function renderAnswer(group) {
    const answerKey = `${S.model}:${key()}:${S.n}`;
    const a = D.answers[answerKey];
    const mentions = claims?.[answerKey] || null;
    closeEvidence();
    const box = $(".talk-reasoning");
    cancelAnimationFrame(typing);
    box.textContent = "";
    $(".talk-think summary").textContent = T.reasoning(a.tokens, a.seconds);
    const nodes = reasoningNodes(a.reasoning, mentions);
    renderGeneSummary(mentions);
    const answer = $(".talk-answer");
    answer.hidden = true;
    const finish = () => {
      box.scrollTop = 0;  // start the reasoning at its first sentence once it has finished typing
      answer.hidden = false;
      if (a.type || a.state) {
        answer.innerHTML = [
          [T.type, a.type ? TYPE_NAME[a.type] || a.type : "—", a.type_ok],
          [T.state, a.state ? STATE_NAME[a.state] || a.state : "—", a.state_ok],
        ]
          .map(([label, value, ok]) => `<span class="pill ${ok ? "ok" : "bad"}">${label} <b>${value}</b><span class="mark" aria-label="${ok ? "correct" : "wrong"}">${ok ? "✓" : "✗"}</span></span>`)
          .join("");
      } else {
        answer.innerHTML = `<span class="pill bad">${T.none}</span>`;
      }
    };
    if (reduce) {
      box.append(...nodes);
      finish();
    } else {
      let i = 0;
      const step = () => {
        const until = Math.min(nodes.length, i + Math.max(6, Math.ceil(nodes.length / 45)));
        for (; i < until; i += 1) box.append(nodes[i]);
        box.scrollTop = box.scrollHeight;
        if (i < nodes.length) typing = requestAnimationFrame(step);
        else finish();
      };
      step();
    }
    $(".talk-truth").textContent = T.truth(TYPE_NAME[S.type], STATE_NAME[S.state]);

  }

  function render() {
    syncButtons();
    const group = D.groups[`${key()}:${S.n}`];
    drawMap(group.cells);
    renderPrompt(group);
    renderPanel(group);
    renderAnswer(group);
  }

  function start(data) {
    D = data;
    segment("type", D.types.map((t) => [t, TYPE_NAME[t], TYPE_COLOR[t]]));
    segment("state", D.states.map((s) => [s, STATE_NAME[s]]));
    segment("n", D.sizes.map((n) => [String(n), String(n)]));
    segment("model", D.models.map((m) => [m, MODEL_NAME[m]]));
    $("[data-talk-run]").textContent = T.run;
    $(".talk-gene-evidence").setAttribute("aria-label", G.evidence);
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && selectedMention) {
        closeEvidence(true);
        event.preventDefault();
      }
    });
    root.classList.add("is-ready");
    render();
    let last = 0;
    new ResizeObserver(() => {
      const w = $(".talk-map canvas").clientWidth;
      if (w && w !== last) {
        last = w;
        drawMap(D.groups[`${key()}:${S.n}`].cells);
      }
    }).observe($(".talk-map"));
  }

  $(".talk-status").textContent = T.loading;
  const fetchBytes = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(response.status);
    return response.arrayBuffer();
  };
  Promise.all([
    fetchBytes(root.dataset.src),
    fetchBytes(root.dataset.claims).then((bytes) => JSON.parse(new TextDecoder().decode(bytes))).catch(() => null),
  ])
    .then(async ([sourceBytes, annotations]) => {
      const data = JSON.parse(new TextDecoder().decode(sourceBytes));
      try {
        claims = await verifiedClaims(data, sourceBytes, annotations);
      } catch (_) {
        claims = null;
      }
      start(data);
    })
    .catch(() => {
      $(".talk-status").textContent = T.failed;
    });
})();
