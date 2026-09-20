/* TALK Figure 1, redrawn as a schematic. No model execution or generated results. */
const SVG_NS = 'http://www.w3.org/2000/svg';

export function mountTalk(root, { ko = false } = {}) {
  const text = ko ? {
    route: '입력 유형', cell: 'Cell', bulk: 'Bulk',
    cellProfile: '세포 · 세포형 pseudobulk', bulkProfile: 'Bulk · 샘플 pseudobulk',
    read: 'RNA 인코딩', align: '토큰 정렬', respond: '응답 생성',
    profile: 'RNA profile', one: '프로파일 하나', genes: '유전자 발현 · 개념도',
    frozen: '고정', trained: '학습', features: 'Contextual features',
    cellAdapter: 'Cell 전용 adapter', bulkAdapter: 'Bulk 전용 adapter',
    queries: 'Learned queries', prefix: 'RNA prefix', question: '맥락·질문',
    queryNote: '자연어 토큰', rnaNote: '프로파일 하나 → K개 토큰',
    rationale: '근거', answer: '최종 답변', schematic: '응답 구조 · 개념도',
    caption: 'Figure 1 · 논문: K개 RNA 토큰/프로파일. 아래 데모: 1개 RNA 토큰/세포.',
    details: '구조 상세',
    detailText: 'BulkFormer와 TF-Sapiens는 고정됩니다. 각 경로의 독립적인 Q-Former와 Qwen3는 함께 학습됩니다. Q-Former는 contextual features와 유효 위치 마스크를 사용합니다. RNA prefix는 질문 앞에 놓입니다. 논문은 요청당 프로파일 하나를 사용하며, K는 세포 수가 아닙니다.',
    stages: ['RNA profile', '고정 encoder', '독립 Q-Former', 'RNA prefix + 질문', '근거 → 답변'],
    steps: '단계',
  } : {
    route: 'Input route', cell: 'Cell', bulk: 'Bulk',
    cellProfile: 'Cell · cell-type pseudobulk', bulkProfile: 'Bulk · sample pseudobulk',
    read: 'Encode RNA', align: 'Align tokens', respond: 'Generate response',
    profile: 'RNA profile', one: 'One profile', genes: 'Gene expression · schematic',
    frozen: 'Frozen', trained: 'Trained', features: 'Contextual features',
    cellAdapter: 'Cell-specific adapter', bulkAdapter: 'Bulk-specific adapter',
    queries: 'Learned queries', prefix: 'RNA prefix', question: 'Context & question',
    queryNote: 'Natural-language tokens', rnaNote: 'One profile → K tokens',
    rationale: 'Rationale', answer: 'Final answer', schematic: 'Response structure · schematic',
    caption: 'Figure 1 · Paper: K RNA tokens/profile. Demo below: 1 RNA token/cell.',
    details: 'Architecture details',
    detailText: 'BulkFormer and TF-Sapiens stay frozen. Each route has an independent Q-Former, trained jointly with Qwen3. The adapters cross-attend to contextual features and valid-position masks. The RNA prefix precedes the question. The paper uses one profile per request; K is not the number of cells.',
    stages: ['RNA profile', 'Frozen encoder', 'Independent Q-Former', 'RNA prefix + question', 'Rationale → answer'],
    steps: 'Stage',
  };
  const arrow = '<svg viewBox="0 0 40 24" aria-hidden="true"><path d="M2 12H35M28 5l7 7-7 7"/></svg>';
  root.classList.add('arch-talk');
  root.innerHTML = `
    <div class="arch-talk-toolbar">
      <div class="arch-talk-route" role="group" aria-label="${text.route}">
        <button type="button" data-route="cell" aria-pressed="true">${text.cell}</button>
        <button type="button" data-route="bulk" aria-pressed="false">${text.bulk}</button>
      </div>
      <span class="arch-talk-route-description">${text.cellProfile}</span>
    </div>
    <div class="arch-talk-flow">
      <section class="arch-talk-panel" aria-label="${text.read}">
        <h3><span>01</span> ${text.read}</h3>
        <div class="arch-talk-node" data-stage="0">
          <div class="arch-talk-node-title"><h4>${text.profile}</h4><span class="arch-talk-meta">${text.one}</span></div>
          <svg class="arch-talk-expression" viewBox="0 0 288 48" role="img" aria-label="${text.genes}"></svg>
          <p class="arch-talk-meta">${text.genes}</p>
        </div>
        <div class="arch-talk-down" data-link="1">${arrow}</div>
        <div class="arch-talk-node arch-talk-encoder" data-stage="1">
          <div class="arch-talk-node-title"><h4 data-encoder>TF-Sapiens</h4><span class="arch-talk-badge">${text.frozen}</span></div>
          <svg class="arch-talk-features" viewBox="0 0 288 48" aria-hidden="true"></svg>
          <p class="arch-talk-meta">${text.features}</p>
        </div>
      </section>
      <div class="arch-talk-between" data-link="2">${arrow}</div>
      <section class="arch-talk-panel" aria-label="${text.align}">
        <h3><span>02</span> ${text.align}</h3>
        <div class="arch-talk-node" data-stage="2">
          <div class="arch-talk-node-title"><h4>Q-Former</h4><span class="arch-talk-badge arch-talk-trained">${text.trained}</span></div>
          <p class="arch-talk-meta" data-adapter>${text.cellAdapter}</p>
          <svg class="arch-talk-queries" viewBox="0 0 288 66" role="img" aria-label="${text.queries}"></svg>
        </div>
        <div class="arch-talk-down" data-link="3">${arrow}</div>
        <div class="arch-talk-node arch-talk-prompt" data-stage="3">
          <div class="arch-talk-node-title"><h4>${text.prefix}</h4><span class="arch-talk-meta">K × d</span></div>
          <div class="arch-talk-tokens" aria-label="${text.rnaNote}"><span>z₁</span><span>z₂</span><span>···</span><span>z<sub>K</sub></span></div>
          <p class="arch-talk-meta">${text.rnaNote}</p>
          <div class="arch-talk-question"><span class="arch-talk-sequence" aria-hidden="true">↓</span><div><strong>${text.question}</strong><span>${text.queryNote}</span></div><svg viewBox="0 0 78 22" aria-hidden="true"><path d="M1 5h13m5 0h26m5 0h26M1 16h26m5 0h15m5 0h17"/></svg></div>
        </div>
      </section>
      <div class="arch-talk-between" data-link="4">${arrow}</div>
      <section class="arch-talk-panel" aria-label="${text.respond}">
        <h3><span>03</span> ${text.respond}</h3>
        <div class="arch-talk-node arch-talk-language" data-stage="4">
          <div class="arch-talk-node-title"><h4>Qwen3</h4><span class="arch-talk-badge arch-talk-trained">${text.trained}</span></div>
          <p class="arch-talk-meta">1.7B / 4B</p>
          <div class="arch-talk-response">
            <div class="arch-talk-rationale"><strong>${text.rationale}</strong><div class="arch-talk-lines" aria-hidden="true"><i></i><i></i><i></i></div></div>
            <div class="arch-talk-answer"><strong>${text.answer}</strong><div class="arch-talk-lines" aria-hidden="true"><i></i></div></div>
          </div>
          <p class="arch-talk-meta arch-talk-response-note">${text.schematic}</p>
        </div>
      </section>
    </div>
    <p class="arch-talk-caption">${text.caption}</p>
    <details class="arch-talk-details"><summary>${text.details}</summary><p>${text.detailText}</p></details>`;

  const element = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  const expression = root.querySelector('.arch-talk-expression');
  const expressionRects = Array.from({ length: 24 }, (_, i) => {
    const rect = element('rect', { x: i * 12, y: 4, width: 9, height: 38, rx: 2 });
    expression.append(rect);
    return rect;
  });
  const features = root.querySelector('.arch-talk-features');
  const featureRects = Array.from({ length: 12 }, (_, i) => {
    const rect = element('rect', { x: i * 24, y: 7 + (i % 3) * 3, width: 18, height: 30 - (i % 3) * 6, rx: 3 });
    features.append(rect);
    return rect;
  });
  const queries = root.querySelector('.arch-talk-queries');
  const queryPaths = [];
  for (let i = 0; i < 8; i += 1) {
    const x = 13 + i * 37;
    queries.append(element('rect', { x, y: 3, width: 15, height: 9, rx: 2, fill: '#b7c4ce' }));
    for (let j = 0; j < 4; j += 1) {
      const path = element('path', { d: `M${x + 7.5} 15L${38 + j * 70} 52`, fill: 'none', stroke: '#dce4ea', 'stroke-width': '1' });
      queries.append(path);
      queryPaths.push(path);
    }
  }
  const queryDots = Array.from({ length: 4 }, (_, i) => {
    const dot = element('circle', { cx: 38 + i * 70, cy: 57, r: 6, fill: '#b7c4ce' });
    queries.append(dot);
    return dot;
  });

  const nodes = [...root.querySelectorAll('[data-stage]')];
  const links = [...root.querySelectorAll('[data-link]')];
  const tokenEls = [...root.querySelectorAll('.arch-talk-tokens span')];
  const rationaleLines = [...root.querySelectorAll('.arch-talk-rationale i')];
  const answer = root.querySelector('.arch-talk-answer');
  const routeButtons = [...root.querySelectorAll('[data-route]')];
  let route = 'cell';
  let frame = 0;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const stage = (value) => Math.min(4, Math.floor(value / 20));
  function connectNodes() {
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    for (const [linkStage, sourceStage, targetStage] of [[2, 1, 2], [4, 3, 4]]) {
      const link = root.querySelector(`.arch-talk-between[data-link="${linkStage}"]`);
      const svg = link.querySelector('svg');
      const path = svg.querySelector('path');
      if (mobile) {
        svg.setAttribute('viewBox', '0 0 40 24');
        path.setAttribute('d', 'M2 12H35M28 5l7 7-7 7');
        continue;
      }
      const bounds = link.getBoundingClientRect();
      const source = root.querySelector(`[data-stage="${sourceStage}"]`).getBoundingClientRect();
      const target = root.querySelector(`[data-stage="${targetStage}"]`).getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const start = source.top + source.height / 2 - bounds.top;
      const end = target.top + target.height / 2 - bounds.top;
      const tip = bounds.width - 2;
      svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
      path.setAttribute('d', `M2 ${start}H${bounds.width / 2}V${end}H${tip}M${tip - 6} ${end - 6}L${tip} ${end}L${tip - 6} ${end + 6}`);
    }
  }
  function draw(value) {
    frame = Math.max(0, Math.min(100, Math.round(value)));
    const active = stage(frame);
    root.dataset.stage = String(active);
    nodes.forEach((node) => {
      const number = Number(node.dataset.stage);
      node.classList.toggle('is-active', number === active);
      node.classList.toggle('is-complete', number < active);
    });
    links.forEach((link) => link.classList.toggle('is-complete', frame >= Number(link.dataset.link) * 20));
    expressionRects.forEach((rect, i) => {
      const intensity = route === 'cell' ? (Math.sin(i * 2.11) + 1) / 2 : (Math.cos(i * 0.73 + 0.4) + 1) / 2;
      rect.setAttribute('fill', `rgb(${Math.round(222 - 178 * intensity)}, ${Math.round(235 - 121 * intensity)}, ${Math.round(245 - 70 * intensity)})`);
      rect.setAttribute('opacity', String(frame >= 20 ? 1 : 0.35 + 0.65 * clamp((frame - i * 0.25) / 10)));
    });
    featureRects.forEach((rect, i) => {
      const revealed = clamp((frame - 20 - i * 0.4) / 7);
      rect.setAttribute('fill', revealed > 0 ? '#6f9dc4' : '#dce4ea');
      rect.setAttribute('opacity', String(0.4 + 0.6 * revealed));
    });
    queryPaths.forEach((path, i) => {
      const progress = clamp((frame - 40 - (i % 4) * 2) / 9);
      path.setAttribute('stroke', progress ? '#8fb5d6' : '#e3e9ee');
      path.setAttribute('stroke-opacity', String(0.3 + 0.7 * progress));
    });
    queryDots.forEach((dot, i) => dot.setAttribute('fill', frame >= 43 + i * 3 ? '#0064e0' : '#b7c4ce'));
    tokenEls.forEach((token, i) => token.classList.toggle('is-filled', frame >= 60 + i * 3));
    rationaleLines.forEach((line, i) => {
      line.style.setProperty('--reveal', String(clamp((frame - 81 - i * 3) / 5)));
    });
    answer.style.setProperty('--answer-reveal', String(clamp((frame - 93) / 6)));
  }
  routeButtons.forEach((button) => button.addEventListener('click', () => {
    route = button.dataset.route;
    routeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    root.querySelector('.arch-talk-route-description').textContent = route === 'cell' ? text.cellProfile : text.bulkProfile;
    root.querySelector('[data-encoder]').textContent = route === 'cell' ? 'TF-Sapiens' : 'BulkFormer';
    root.querySelector('[data-adapter]').textContent = route === 'cell' ? text.cellAdapter : text.bulkAdapter;
    draw(frame);
    connectNodes();
  }));
  new ResizeObserver(connectNodes).observe(root);
  draw(0);
  connectNodes();
  return {
    frameCount: 101,
    draw,
    frameLabel: (value) => `${text.steps} ${stage(value) + 1} / 5`,
    stageLabel: (value) => text.stages[stage(value)],
  };
}
