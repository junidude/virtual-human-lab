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
        genes: (y, n) => `추론에 나온 유전자 ${y + n}개 중 ${y}개가 이 세포들에서 실제로 검출됨.`,
        detected: (k, n) => `이 세포 ${n}개 중 ${k}개에서 검출`,
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
        genes: (y, n) => `${y} of the ${y + n} genes named in the reasoning were actually detected in these cells.`,
        detected: (k, n) => `detected in ${k} of these ${n} cells`,
        run: "Recorded run · temperature 0.6 · one fixed seed per group",
      };

  let D = null;
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

  function reasoningNodes(text, genes, n) {
    const parts = text.split(/((?<![A-Za-z0-9_-])[A-Z][A-Z0-9-]{2,}(?:\.[0-9]+)?(?![A-Za-z0-9_-]))/);
    return parts.map((part, i) => {
      if (i % 2 === 1 && part in genes) {
        const m = document.createElement("mark");
        m.className = genes[part] > 0 ? "yes" : "no";
        m.textContent = part;
        m.title = T.detected(genes[part], n);
        return m;
      }
      return document.createTextNode(part);
    });
  }

  function renderAnswer(group) {
    const a = D.answers[`${S.model}:${key()}:${S.n}`];
    const box = $(".talk-reasoning");
    cancelAnimationFrame(typing);
    box.textContent = "";
    $(".talk-think summary").textContent = T.reasoning(a.tokens, a.seconds);
    const nodes = reasoningNodes(a.reasoning, a.genes, group.cells.length);
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
    const yes = Object.values(a.genes).filter((k) => k > 0).length;
    const no = Object.keys(a.genes).length - yes;
    $(".talk-gene-summary").textContent = Object.keys(a.genes).length ? T.genes(yes, no) : "";
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
    $(".talk-run").textContent = T.run;
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
  fetch(root.dataset.src)
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(start)
    .catch(() => {
      $(".talk-status").textContent = T.failed;
    });
})();
