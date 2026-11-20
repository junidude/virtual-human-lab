(() => {
  'use strict';

  const ko = document.documentElement.lang === 'ko';
  const t = (en, kr) => ko ? kr : en;
  const byId = id => document.getElementById(id);
  const taskSelect = byId('task');
  const probeSelect = byId('probe');
  const genetic = t('Genetic perturbation response', '유전자 교란 뒤 발현 변화');
  const geneticMetric = t('Pearson r · top 20 DE genes', 'Pearson r · 차등 발현 유전자 20개');
  const tasks = {
    tabula: {modality: 'sc', view: 'pooled', name: t('Cell-type classification', '세포 유형 분류'), dataset: 'Tabula Sapiens', metric: 'macro-F1'},
    adamson: {modality: 'sc', view: 'token', name: genetic, dataset: 'Adamson', metric: geneticMetric},
    norman: {modality: 'sc', view: 'token', name: genetic, dataset: 'Norman', metric: geneticMetric},
    tcga: {modality: 'bulk', view: 'pooled', name: t('Cancer-type classification', '암 유형 분류'), dataset: 'TCGA', metric: 'macro-F1'},
    panacea: {modality: 'bulk', view: 'pooled', name: t('Drug-response prediction', '약물 반응 예측'), dataset: 'PANACEA', metric: t('Pearson r · expression change', 'Pearson r · 발현 변화')}
  };
  const probes = {
    presence: {name: t('Gene detection', '발현 여부 판별'), metric: t('Detection accuracy', '발현 여부 정확도')},
    order: {name: t('Gene expression order', '유전자 간 발현 순서'), metric: t('Gene-pair ordering accuracy', '유전자 쌍의 발현 순서 정확도')},
    value: {name: t('Expression level', '유전자 발현량'), metric: t('Median gene-wise R²', '유전자별 R² 중앙값')}
  };
  const recipeLabels = {
    Presence: t('Learning which genes are expressed', '어떤 유전자가 발현되는지 학습'),
    Identity: t('Predicting a masked gene’s identity', '가려진 유전자의 이름을 예측'),
    GPT: t('Predicting the next gene in an ordered list', '순서대로 나열한 유전자 중 다음 항목을 예측'),
    'Bin-Class': t('Classifying expression into bins', '발현량이 속하는 구간을 분류'),
    'Bin-Value': t('Predicting a numerical expression bin', '발현 구간의 번호를 예측'),
    Value: t('Reconstructing continuous expression levels', '연속적인 발현량을 복원')
  };

  const formatter = new Intl.NumberFormat(ko ? 'ko-KR' : 'en-US', {
    minimumFractionDigits: 3, maximumFractionDigits: 3
  });
  let data;
  let selected = 'Presence';
  let probeRanking = [];
  let taskRanking = [];

  function measure() {
    return document.querySelector('input[name="measure"]:checked').value;
  }

  function formatScore(score) {
    const absolute = formatter.format(Math.abs(score));
    if (score < 0) return '−' + absolute;
    return measure() === 'gain' && score > 0 ? '+' + absolute : absolute;
  }

  function ranked(metrics) {
    const key = measure();
    return Object.entries(metrics)
      .map(([recipe, scores]) => ({recipe, score: scores[key]}))
      .sort((a, b) => b.score - a.score);
  }

  function span(className, value) {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = value;
    return element;
  }

  function rows(list, ranking) {
    const items = ranking.map(({recipe, score}, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tm-row';
      button.dataset.recipe = recipe;
      button.append(
        span('tm-rank', String(index + 1)),
        span('tm-recipe', recipe),
        span('tm-score', formatScore(score))
      );
      item.append(button);
      return item;
    });
    list.replaceChildren(...items);
  }

  function highlight(recipe) {
    selected = recipe;
    document.querySelectorAll('.tm-row').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.recipe === selected));
    });
    const rankY = index => (index + 0.5) * 100 / probeRanking.length;
    const lines = [];
    for (const [index, model] of probeRanking.entries()) {
      const start = rankY(index);
      const end = rankY(taskRanking.findIndex(row => row.recipe === model.recipe));
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M 0 ${start} C 43 ${start} 57 ${end} 100 ${end}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      const active = model.recipe === selected;
      if (active) path.classList.add('is-selected');
      path.setAttribute('stroke-width', active ? '3.5' : '1.5');
      if (active) lines.push(path);
      else lines.unshift(path);
    }
    byId('connections').replaceChildren(...lines);
    const left = probeRanking.findIndex(row => row.recipe === selected);
    const right = taskRanking.findIndex(row => row.recipe === selected);
    const title = document.createElement('strong');
    title.textContent = `${selected} · ${recipeLabels[selected]}`;
    const text = document.createElement('p');
    const leftScore = formatScore(probeRanking[left].score);
    const rightScore = formatScore(taskRanking[right].score);
    const n = taskRanking.length;
    const view = measure() === 'gain' ? t('Gain', '사전학습 증감') : t('Final score', '최종 점수');
    text.textContent = t(
      `${view} on the expression test is ${leftScore} (rank ${left + 1} of ${n}) and on the biological task is ${rightScore} (rank ${right + 1} of ${n}).`,
      `${view} 기준으로 발현 검사는 ${leftScore} (${n}종 중 ${left + 1}위), 생물학적 과제는 ${rightScore} (${n}종 중 ${right + 1}위)입니다.`
    );
    byId('detail').replaceChildren(title, text);
  }

  function render() {
    const task = tasks[taskSelect.value];
    const probe = probes[probeSelect.value];
    probeRanking = ranked(data.probes[task.modality][task.view][probeSelect.value]);
    taskRanking = ranked(data.tasks[taskSelect.value]);
    const source = task.view === 'pooled' ? t('Pooled profile', '프로필 전체') : t('Gene tokens', '유전자 토큰');
    byId('probe-name').textContent = probe.name;
    byId('probe-metric').textContent = source + ' · ' + probe.metric;
    byId('task-name').textContent = task.name;
    byId('task-metric').textContent = task.dataset + ' · ' + task.metric;
    rows(byId('probe-list'), probeRanking);
    rows(byId('task-list'), taskRanking);
    highlight(probeRanking.some(row => row.recipe === selected) ? selected : probeRanking[0].recipe);
  }

  function setProbes(preferred) {
    const task = tasks[taskSelect.value];
    const available = data.probes[task.modality][task.view];
    const options = Object.keys(probes).filter(key => available[key])
      .map(key => new Option(probes[key].name, key));
    probeSelect.replaceChildren(...options);
    probeSelect.value = available[preferred] ? preferred : 'value';
  }

  function activate(scores) {
    data = scores;
    setProbes('presence');
    render();
    taskSelect.addEventListener('change', () => {
      setProbes(probeSelect.value);
      render();
    });
    probeSelect.addEventListener('change', render);
    document.querySelector('.tm-measure').addEventListener('change', render);
    document.querySelector('.tm-ranks').addEventListener('click', event => {
      const button = event.target.closest('.tm-row');
      if (button) highlight(button.dataset.recipe);
    });
    document.querySelectorAll('[data-example]').forEach(button => {
      button.hidden = false;
      button.addEventListener('click', () => {
        const drug = button.dataset.example === 'panacea';
        taskSelect.value = button.dataset.example;
        setProbes(drug ? 'value' : 'presence');
        selected = drug ? 'Identity' : 'Presence';
        document.querySelector('input[value="gain"]').checked = true;
        render();
        taskSelect.focus({preventScroll: true});
        byId('explorer-title').scrollIntoView({block: 'start'});
      });
    });
    byId('interactive').hidden = false;
    byId('fallback').hidden = true;
  }

  fetch('/research/transcriptome-models/scores.json')
    .then(response => {
      if (!response.ok) throw new Error('Unavailable scores');
      return response.json();
    })
    .then(activate)
    .catch(() => {
      const message = document.createElement('p');
      message.textContent = t('The interactive scores could not be loaded. Refresh the page to try again.', '점수 데이터를 불러오지 못했습니다. 새로고침하면 다시 시도합니다.');
      byId('fallback').append(message);
    });
})();
