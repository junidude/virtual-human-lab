/* Figure 1 flow, with real recorded expression views of one generated cell. */
export async function mountDiffusion(root, {ko}) {
  const t = (en, kr) => ko ? kr : en;
  const ns = 'http://www.w3.org/2000/svg';
  root.classList.add('arch-diffusion');
  root.innerHTML = `
    <div class="arch-condition" aria-label="${t('Conditioning path', '조건 입력 경로')}">
      <span class="arch-condition-input"><svg viewBox="0 0 30 24" aria-hidden="true"><path d="M3 20V12M9 20V4M15 20V9M21 20V2M27 20V14" stroke="currentColor" stroke-width="3"/></svg><strong>Pseudobulk</strong> · ${t('fixed', '고정')}</span>
      <span aria-hidden="true">+</span><span class="arch-condition-input">${t('Time', '시간')} <strong data-time>t = 1.00</strong></span>
      <span aria-hidden="true">→</span><span class="arch-condition-input arch-condition-context">${t('Context → all 7 blocks', 'Context → 7개 블록')}</span>
    </div>
    <div class="arch-grid">
      <div class="arch-node">
        <span class="arch-node-kicker">01 / ${t('STATE', '상태')}</span>
        <h3>${t('Noise → one cell', '노이즈 → 세포 하나')}</h3>
        <p class="arch-node-note">${t('Gene-space state · xₜ', '유전자 공간의 상태 · xₜ')}</p>
        <svg class="arch-matrix" data-matrix="state" viewBox="0 0 240 160" role="img" aria-label="${t('Decoded noisy state of one cell: 96 genes, fixed order and color scale', '한 세포의 디코딩된 노이즈 상태: 96개 유전자, 순서와 색상 범위 고정')}"></svg>
        <div class="arch-matrix-status"><span>${t('Decoded state', '디코딩된 상태')}</span><span data-state-time></span></div>
      </div>
      <span class="arch-flow-arrow" aria-hidden="true">→</span>
      <div class="arch-node arch-denoiser">
        <span class="arch-node-kicker">02 / ${t('DENOISE', '노이즈 제거')}</span>
        <h3>${t('Conditioned MLP', '조건부 MLP')}</h3>
        <p class="arch-node-note">${t('7 blocks · skip connections', '7개 블록 · skip 연결')}</p>
        <div class="arch-inputs"><span>xₜ · 2G</span><span>∥ ${t('self-conditioning', '자기 조건화')} · 2G</span><span>→ 4G</span></div>
        <svg class="arch-network" viewBox="0 0 290 130" role="img" aria-label="${t('Seven MLP blocks, with three skip additions and a shared output trunk', '7개 MLP 블록, 3개의 skip 합산, 공유 출력층')}">
          <path d="M0 82H286" class="skip"/>
          <path d="M21 46V4H268V46M59 52V14H230V52M97 63V24H192V63" class="skip"/>
          ${[72,72,48,30,48,72,72].map((h, i) => `<rect class="block" x="${8+i*38}" y="${82-h/2}" width="26" height="${h}" rx="4"/>`).join('')}
          <g fill="white" stroke="#91a7b8"><circle cx="192" cy="63" r="5"/><circle cx="230" cy="52" r="5"/><circle cx="268" cy="46" r="5"/></g>
          <g stroke="#91a7b8"><path d="M189 63h6m-3-3v6M227 52h6m-3-3v6M265 46h6m-3-3v6"/></g>
        </svg>
        <div class="arch-heads"><span>${t('Value head', '발현값 head')} · G</span><span>${t('Support head', '발현 여부 head')} · G</span></div>
      </div>
      <span class="arch-flow-arrow" aria-hidden="true">→</span>
      <div class="arch-node">
        <span class="arch-node-kicker">03 / ${t('PREDICT', '예측')}</span>
        <h3>${t('Clean estimate', '노이즈 없는 상태 예측')}</h3>
        <p class="arch-node-note">${t('Value + soft support · x̂₀', '발현값 + soft support · x̂₀')}</p>
        <svg class="arch-matrix" data-matrix="prediction" viewBox="0 0 240 160" role="img" aria-label="${t('Decoded clean-expression estimate for the same cell and genes', '같은 세포와 유전자의 디코딩된 발현 예측')}"></svg>
        <div class="arch-matrix-status"><span>${t('Expression estimate', '발현 예측')}</span><span data-prediction-time></span></div>
      </div>
    </div>
    <div class="arch-loop">
      <span class="arch-loop-symbol" aria-hidden="true">↶</span><strong>DDIM(xₜ, x̂₀, t) → xₜ₋Δₜ</strong><span>· 50 ${t('steps', '단계')}</span>
      <span class="arch-loop-divider" aria-hidden="true">/</span><span>${t('Soft x̂₀ → next self-condition', 'Soft x̂₀ → 다음 자기 조건화')}</span>
    </div>
    <div class="arch-output">
      <div class="arch-output-path"><span>${t('Final step', '마지막 단계')}</span><span aria-hidden="true">→</span><span>${t('Rescale + support & assay gate', '역변환 + 발현·측정 범위 gate')}</span><span aria-hidden="true">→</span><strong class="arch-final">${t('Generated expression', '생성된 발현값')}</strong></div>
      <div class="arch-key"><span>0</span><i aria-hidden="true"></i><span>8.5</span><span>log1p(CP10k)</span></div>
    </div>
    <p class="arch-caption">${t('Recorded · 1 monocyte · 96 genes · ctx2048 E12', '실제 생성 기록 · 단핵구 1개 · 유전자 96개 · ctx2048 E12')}</p>
    <details><summary>${t('Inside the diagram', '구조도 자세히')}</summary>
      <div class="arch-details-grid">
        <p><strong>${t('Gene space.', '유전자 공간.')}</strong> ${t('2G = G values + G support coordinates. The 256-wide hidden layer is internal to the denoiser, not the diffusion space.', '2G = G개 발현값 + G개 발현 여부 좌표. 256차원 층은 denoiser 내부이며, diffusion은 유전자 공간에서 진행됩니다.')}</p>
        <p><strong>${t('Condition.', '조건 입력.')}</strong> ${t('Raw pseudobulk, depth, cell count and gene availability. Bulk and time embeddings are added and mixed; all blocks receive the context. No ground-truth cell is an inference input.', 'Pseudobulk raw count, depth, 세포 수, 측정 유전자 범위. Bulk·시간 임베딩을 합산·변환해 모든 블록에 전달합니다. 실제 세포는 inference 입력이 아닙니다.')}</p>
        <p><strong>${t('Two heatmaps.', '두 행렬.')}</strong> ${t('Decoded expression views, not the raw 2G tensor. Each tile is one gene of the same cell. Early decoded noise is not biological expression. Fixed genes and scale; no interpolation toward a real cell.', '원시 2G tensor가 아닌 디코딩된 발현값입니다. 각 칸은 같은 세포의 유전자 하나입니다. 초기 노이즈는 생물학적 발현값이 아닙니다. 유전자 순서와 색상 범위는 고정입니다.')}</p>
        <p><strong>${t('Figure 1 → this run.', 'Figure 1 → 이 기록.')}</strong> ${t('Same value–support design; this run uses 2048-wide context. The final estimate repeats t = 0.02; it is not an extra model call at t = 0. Independent noise draws generate additional cells.', '같은 value–support 구조이며, 이 기록은 2048차원 context를 사용합니다. 마지막 예측은 t = 0.02 결과를 유지하며, t = 0에서 모델을 다시 호출하지 않습니다. 각 세포는 독립적인 노이즈에서 생성됩니다.')}</p>
        <p><strong>${t('Selection.', '표시 유전자.')}</strong> ${t('First 12 genes from each of eight published gene blocks; 96 of 2,980 genes. One fixed exemplar selected by endpoint cell type.', '기존 8개 유전자 그룹에서 각 12개씩, 전체 2,980개 중 96개. 최종 세포형을 기준으로 정해진 한 세포를 표시합니다.')} <a href="/research/architecture/diffusion-recording.json">${t('Data', '데이터')} ↗</a></p>
        <p><strong>${t('Sampling.', '샘플링.')}</strong> ${t('50 DDIM steps · η = 0 · EMA. The final output applies value rescaling, a support threshold and an assay mask. Cell types are annotated after generation.', '50 DDIM 단계 · η = 0 · EMA. 최종 출력에 발현값 역변환, support threshold, assay mask를 적용합니다. 세포형은 생성 후 annotation합니다.')}</p>
      </div>
    </details>`;
  const response = await fetch('/research/architecture/diffusion-recording.json?v=20260921-1');
  if (!response.ok) throw new Error('Recording unavailable');
  const data = await response.json();
  if (data.frames !== 51 || data.genes.length !== 96 || data.state.length !== 51 || data.prediction.length !== 51) throw new Error('Invalid recording');
  const matrices = {};
  for (const kind of ['state', 'prediction']) {
    const svg = root.querySelector(`[data-matrix="${kind}"]`);
    matrices[kind] = data.genes.map((gene, index) => {
      const tile = document.createElementNS(ns, 'rect');
      tile.setAttribute('x', String((index % 12) * 20));
      tile.setAttribute('y', String(Math.floor(index / 12) * 20));
      tile.setAttribute('width', '17.5'); tile.setAttribute('height', '17.5');
      tile.setAttribute('rx', '2.5');
      const title = document.createElementNS(ns, 'title');
      tile.append(title); svg.append(tile);
      return {tile, title, gene};
    });
  }
  const ramp = Array.from({length:256}, (_, value) => {
    const x = value / 255;
    const a = x < 0.5 ? [239,243,246] : [152,186,216];
    const b = x < 0.5 ? [152,186,216] : [23,101,165];
    const f = x < 0.5 ? x * 2 : (x - 0.5) * 2;
    return `rgb(${a.map((v,i) => Math.round(v + (b[i]-v)*f)).join(',')})`;
  });
  const blocks = root.querySelectorAll('.block');
  return {
    frameCount: data.frames,
    frameLabel: frame => `${String(frame).padStart(2,'0')} / 50`,
    stageLabel: frame => frame === 0 ? t('Noise', '노이즈') : frame === 50 ? t('Final state', '최종 상태') : t('Denoising', '노이즈 제거'),
    draw(frame) {
      for (const kind of ['state', 'prediction']) {
        matrices[kind].forEach(({tile,title,gene}, i) => {
          const value = data[kind][frame][i];
          tile.setAttribute('fill', ramp[value]);
          title.textContent = `${gene} · ${(value / 255 * data.value_max).toFixed(2)} log1p(CP10k)`;
        });
      }
      root.dataset.final = String(frame === 50);
      root.querySelector('[data-time]').textContent = `t = ${data.prediction_times[frame].toFixed(2)}`;
      root.querySelector('[data-state-time]').textContent = `t = ${data.state_times[frame].toFixed(2)}`;
      root.querySelector('[data-prediction-time]').textContent = `t = ${data.prediction_times[frame].toFixed(2)}`;
      // Every denoising call executes all seven blocks; one frame is one DDIM step.
      blocks.forEach(block => block.classList.toggle('active', frame < 50));
    },
  };
}
