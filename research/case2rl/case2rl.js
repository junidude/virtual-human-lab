/* Static, source-preserving case explorer. No model/backend calls. */
(() => {
  'use strict';
  const root = document.querySelector('[data-case2rl]');
  if (!root) return;
  const ko = document.documentElement.lang === 'ko';
  const t = ko ? {
    history: '병력', exam: '진찰', tests: '검사', guard: '공개 제한 검증', generated: '생성 · 반복 검증',
    source: '원문', probe: '검증 예시', generatedBadge: '생성 · 저장됨', fact: '소견', request: '저장된 요청',
    caption: '원문 소견', response: '저장된 응답', exact: '정확한 검사명 필요',
    sourceFoot: '케이스 설정', guardFoot: '공개 제한 검증', generatedFoot: '캐시 반복 일관성 검증',
    passed: '통과', failed: '미통과', reveal: '진단명 보기', hide: '진단명 숨기기',
    error: '예시를 불러오지 못했습니다. 아래 JSON 링크에서 확인할 수 있습니다.'
  } : {
    history: 'History', exam: 'Examination', tests: 'Tests', guard: 'Disclosure checks', generated: 'Generated · repeat checks',
    source: 'Source', probe: 'Probe', generatedBadge: 'Generated · saved', fact: 'Finding', request: 'Saved request',
    caption: 'Source finding', response: 'Saved response', exact: 'Exact order required',
    sourceFoot: 'Case configuration', guardFoot: 'Disclosure check', generatedFoot: 'Cached repeat consistency',
    passed: 'Passed', failed: 'Failed', reveal: 'Reveal diagnosis', hide: 'Hide diagnosis',
    error: 'The example could not be loaded. Use the JSON link below.'
  };
  const el = (selector) => root.querySelector(selector);
  const category = el('[data-category]');
  const item = el('[data-item]');
  const buttons = [...root.querySelectorAll('[data-mode]')];
  let data;
  let mode = 'facts';
  let records = [];
  const savedSelection = { facts: { category: 'history', item: '0' }, checks: { category: 'guard', item: '0' } };

  function option(value, text) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = text;
    return node;
  }
  function renderRecord() {
    const entry = records[Number(item.value)];
    if (!entry) return;
    const facts = mode === 'facts';
    const generated = !facts && entry.category === 'generated';
    const kind = el('[data-record-kind]');
    kind.textContent = facts ? t.source : generated ? t.generatedBadge : t.probe;
    kind.dataset.kind = facts ? 'source' : entry.category;
    el('[data-record-id]').textContent = facts ? entry.id : `probe-${String(data.audit.samples.indexOf(entry) + 1).padStart(2, '0')}`;
    el('[data-record-title]').textContent = facts ? entry.name : entry.request;
    el('[data-record-title]').lang = 'en';
    el('[data-record-caption]').textContent = facts ? t.caption : t.response;
    el('[data-record-text]').textContent = facts ? entry.text : entry.response;
    const protectedBadge = el('[data-protected]');
    protectedBadge.hidden = !(facts && entry.explicit_order_only);
    protectedBadge.textContent = t.exact;
    el('[data-record-foot]').textContent = facts ? t.sourceFoot : `${generated ? t.generatedFoot : t.guardFoot} · ${entry.passed ? t.passed : t.failed}`;
    savedSelection[mode] = { category: category.value, item: item.value };
  }
  function populateItems(previous = '0') {
    records = (mode === 'facts' ? data.facts : data.audit.samples).filter((entry) => entry.category === category.value);
    item.replaceChildren(...records.map((entry, i) => option(String(i), mode === 'facts' ? entry.name : entry.request)));
    item.value = records[Number(previous)] ? previous : '0';
    renderRecord();
  }
  function setMode(value) {
    mode = value;
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    const categories = mode === 'facts' ? ['history', 'exam', 'tests'] : ['guard', 'generated'];
    category.replaceChildren(...categories.map((value) => option(value, t[value])));
    category.value = savedSelection[mode].category;
    el('[data-item-label]').textContent = mode === 'facts' ? t.fact : t.request;
    populateItems(savedSelection[mode].item);
  }
  function validate(value) {
    if (value.schema !== 'case2rl.public-demo.v1' || value.publishable !== true ||
        typeof value.presentation !== 'string' || typeof value.reference_diagnosis !== 'string' ||
        !Array.isArray(value.facts) || !value.facts.length || !Array.isArray(value.audit?.samples) ||
        !value.audit.samples.length || value.provenance?.api_calls_on_this_page !== false ||
        value.provenance?.original_text_preserved !== true) throw new Error('Invalid public demo');
    for (const fact of value.facts) {
      if (!['history', 'exam', 'tests'].includes(fact.category) ||
          ['id', 'name', 'text'].some((key) => typeof fact[key] !== 'string')) throw new Error('Invalid source fact');
    }
    for (const sample of value.audit.samples) {
      if (!['guard', 'generated'].includes(sample.category) ||
          ['request', 'response', 'check'].some((key) => typeof sample[key] !== 'string') ||
          typeof sample.passed !== 'boolean') throw new Error('Invalid saved check');
    }
    if (!Number.isInteger(value.audit.total) || !Number.isInteger(value.audit.passed)) throw new Error('Invalid audit totals');
  }
  async function init() {
    try {
      const source = new URL(root.dataset.src, location.href);
      if (source.origin !== location.origin) throw new Error('Unexpected data origin');
      const response = await fetch(source, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      validate(data);
      el('[data-presentation]').textContent = data.presentation;
      el('[data-audit-total]').textContent = `${data.audit.passed} / ${data.audit.total}`;
      buttons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
      category.addEventListener('change', () => populateItems());
      item.addEventListener('change', renderRecord);
      el('[data-reveal]').addEventListener('click', (event) => {
        const button = event.currentTarget;
        const visible = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(visible));
        button.textContent = visible ? t.hide : t.reveal;
        el('[data-diagnosis]').textContent = visible ? data.reference_diagnosis : '';
        el('#reference-answer').hidden = !visible;
      });
      setMode('facts');
      el('.c2-explorer-body').hidden = false;
      el('[data-status]').hidden = true;
    } catch (error) {
      el('[data-status]').textContent = t.error;
      el('[data-status]').classList.add('is-error');
    }
  }
  init();
})();

/* Recorded source-completion examples and transparent reward reweighting. */
(() => {
  'use strict';
  const root = document.querySelector('[data-case2rl-study]');
  if (!root) return;
  const ko = document.documentElement.lang === 'ko';
  const select = (s) => root.querySelector(s);
  const text = (tag, value, cls) => { const e=document.createElement(tag); e.textContent=value; if(cls)e.className=cls; return e; };
  const fixed = (n) => Number(n).toFixed(4);
  const labels = ko ? {generated:'생성된 결과 · 원문 근거 없음',mixed:'원문 + 생성',refused:'생성 거절',turn:'턴',cost:'모의 비용',units:'임시 가격 단위',actual:'기록값',
    invalid:'모든 가중치를 표시된 범위 안의 숫자로 입력하세요.',error:'기록을 불러오지 못했습니다. 전체 검토 콘솔에서 확인하세요.'}
    : {generated:'Generated · no source measurement',mixed:'Core + generated',refused:'Generation refused',turn:'turn',cost:'Modeled cost',units:'placeholder price units',actual:'Recorded',
      invalid:'Enter finite weights within the displayed ranges.',error:'Recorded data could not be loaded. Open the full reviewer.'};
  let data;
  function example(entry) {
    const box=text('article','', 'c2-example'); box.dataset.kind=entry.provenance;
    box.append(text('span',labels[entry.provenance] || entry.provenance,'c2-eyebrow'),
      text('h3',entry.request), text('small',`${entry.candidate_label} · ${labels.turn} ${entry.turn}`),text('pre',entry.response));
    if (entry.source_ids?.length) box.append(text('small',`Source IDs · ${entry.source_ids.join(' · ')}`));
    if (entry.generated_text && entry.provenance==='mixed') {
      const d=document.createElement('details');d.append(text('summary',ko?'생성된 부분':'Generated portion'),text('pre',entry.generated_text));box.append(d);
    }
    if (entry.notes?.length) box.append(text('pre',entry.notes.join('\n')));
    return box;
  }
  function updateWeights() {
    const values={};let valid=true;
    for (const input of root.querySelectorAll('[data-weight]')) {
      const value=Number(input.value);
      if(input.value.trim()==='' || !Number.isFinite(value) || value<Number(input.min) || value>Number(input.max)) valid=false;
      values[input.dataset.weight]=value;
    }
    const output=select('[data-whatif]');
    if(!valid){output.textContent=labels.invalid;output.dataset.valid='false';return;}
    output.dataset.valid='true';
    output.replaceChildren(...data.runs.map((run,i)=>{
      const reward=values.dx_weight*(run.reward.dx_score-1)/4-values.cost_weight*Math.min(1,run.cost_usd/values.cost_scale_usd)-values.penalty_multiplier*run.reward.penalty_total;
      const span=text('span',`${run.candidate_label} · ${fixed(reward)}`);span.dataset.candidate=String(i);span.dataset.reward=String(reward);return span;
    }));
  }
  async function init() {
    try {
      const url=new URL(root.dataset.story,location.href);
      if(url.origin!==location.origin)throw Error('Unexpected data origin');
      const response=await fetch(url); if(!response.ok)throw Error('Data unavailable');
      data=await response.json();
      if(data.schema_version!=='case2rl.public-story.v1'||data.runs.length!==2)throw Error('Invalid recorded story');
      select('[data-missing-examples]').replaceChildren(...data.examples.filter(e=>e.kind==='missing').map(example));
      select('[data-extra-examples]').replaceChildren(...data.examples.filter(e=>e.kind!=='missing').map(example));
      select('[data-recorded-rewards]').replaceChildren(...data.runs.map((run,i)=>{
        const e=text('article','', 'c2-reward-record');e.dataset.candidate=String(i);e.dataset.recordedReward=String(run.reward.total);
        e.append(text('span',`${run.candidate_label} · ${run.turns} ${ko ? '턴' : 'turns'}`,'c2-eyebrow'),text('strong',fixed(run.reward.total)),
          text('p',`${fixed(run.reward.dx_term)} − ${fixed(run.reward.cost_term)} − ${fixed(run.reward.penalty_total)}`,'c2-term'),
          text('p',`${labels.cost} · ${run.cost_usd.toLocaleString('en-US')} ${labels.units}`,'c2-scope-note'));return e;
      }));
      for(const input of root.querySelectorAll('[data-weight]'))input.addEventListener('input',updateWeights);
      select('[data-reward-reset]').addEventListener('click',()=>{
        for(const input of root.querySelectorAll('[data-weight]'))input.value=String(input.dataset.weight==='penalty_multiplier'?1:data.reward_config[input.dataset.weight]);
        updateWeights();
      });
      select('[data-reward-reset]').click();select('[data-story-status]').hidden=true;root.classList.add('is-ready');
    }catch(error){select('[data-story-status]').textContent=labels.error;}
  }
  init();
})();
