(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const ko = document.documentElement.lang === 'ko';
  const t = (en, kr) => ko ? kr : en;
  const task = $('checkpoint-task');
  const stageInputs = [...document.querySelectorAll('input[name="checkpoint-stage"]')];

  function rankRecipes(recipes, score) {
    const sorted = recipes.map(([name, values]) => ({name, score: score(values)}))
      .sort((a, b) => b.score - a.score);

    // Equal scores share the mean of their positions in the ranking.
    for (let i = 0; i < sorted.length;) {
      let end = i + 1;
      while (end < sorted.length && sorted[end].score === sorted[i].score) end++;
      const rank = (i + 1 + end) / 2;
      for (let row = i; row < end; row++) sorted[row].rank = rank;
      i = end;
    }
    return sorted;
  }

  function correlation(order, outcomes) {
    const middle = (order.length + 1) / 2;
    let cross = 0;
    let earlySquares = 0;
    let finalSquares = 0;
    for (const row of order) {
      const early = row.rank - middle;
      const final = outcomes.get(row.name).rank - middle;
      cross += early * final;
      earlySquares += early * early;
      finalSquares += final * final;
    }
    return cross / Math.sqrt(earlySquares * finalSquares);
  }

  function formatRho(value) {
    return (value < 0 ? '−' : value > 0 ? '+' : '') + Math.abs(value).toFixed(2);
  }

  function drawTimeline(stages, correlations, current) {
    const points = correlations.map((rho, i) => ({
      x: 100 * (i + .5) / stages.length,
      y: 50 * (1 - rho)
    }));
    $('checkpoint-curve').setAttribute('d', points.map((point, i) =>
      (i ? 'L' : 'M') + point.x + ' ' + point.y
    ).join(' '));
    const markers = points.map((point, i) => {
      const marker = document.createElement('label');
      marker.htmlFor = 'ck-stage-' + stages[i];
      marker.className = i === current ? 'ck-marker is-current' : 'ck-marker';
      marker.style.left = point.x + '%';
      marker.style.top = point.y + '%';
      return marker;
    });
    $('checkpoint-markers').replaceChildren(...markers);
    for (const [i, stage] of stages.entries()) {
      document.querySelector('[data-rho="' + stage + '"]').textContent = 'ρ ' + formatRho(correlations[i]);
    }
  }

  function showTable(order, outcomes) {
    const rows = order.map(({name, score, rank}) => {
      const tr = document.createElement('tr');
      tr.dataset.recipe = name;
      const outcome = outcomes.get(name);
      [rank, name, score.toFixed(3), outcome.rank, outcome.score.toFixed(3)].forEach((value, i) => {
        const cell = document.createElement(i === 1 ? 'th' : 'td');
        if (i === 1) cell.scope = 'row';
        cell.textContent = value;
        tr.append(cell);
      });
      return tr;
    });
    $('checkpoint-rows').replaceChildren(...rows);
  }

  function showPick(pick, outcomes, metric) {
    const outcome = outcomes.get(pick.name);
    const name = document.createElement('strong');
    name.textContent = pick.name;
    $('checkpoint-pick').replaceChildren(
      name,
      t(
        ' had the highest LogME. It ranked ' + outcome.rank + ' of ' + outcomes.size + ' on the final task (' + metric + ' ' + outcome.score.toFixed(3) + ').',
        ' 모델의 LogME가 가장 높았습니다. 최종 성능은 ' + outcomes.size + '종 중 ' + outcome.rank + '위였습니다(' + metric + ' ' + outcome.score.toFixed(3) + ').'
      )
    );
  }

  function render(data) {
    const selectedStage = stageInputs.find(input => input.checked).value;
    const current = data.stages.indexOf(selectedStage);
    const option = task.selectedOptions[0];
    const recipes = Object.entries(data.tasks[task.value].recipes);
    const final = rankRecipes(recipes, recipe => recipe.final);
    const outcomes = new Map(final.map(row => [row.name, row]));
    const orders = data.stages.map((_, i) => rankRecipes(recipes, recipe => recipe.logme[i]));
    const correlations = orders.map(order => correlation(order, outcomes));
    const rho = correlations[current];
    drawTimeline(data.stages, correlations, current);
    const metric = option.dataset.metric;
    $('checkpoint-rho').textContent = formatRho(rho);
    $('checkpoint-interpretation').textContent = rho === 1
      ? t('The two rankings match at every position.', '두 순위가 모든 모델에서 일치합니다.')
      : rho === -1
        ? t('The two rankings are in exactly opposite order.', '두 순위가 정확히 반대 순서입니다.')
        : rho > 0
          ? t('Higher LogME tended to go with better final performance.', 'LogME가 높은 모델일수록 최종 성능도 높은 경향이 있었습니다.')
          : rho < 0
            ? t('Higher LogME tended to go with lower final performance.', 'LogME가 높은 모델일수록 최종 성능이 낮은 경향이 있었습니다.')
            : t('The two rankings show no overall association.', '두 순위 사이에 일정한 경향이 보이지 않습니다.');
    showPick(orders[current][0], outcomes, metric);
    $('checkpoint-caption').textContent = option.textContent + ' · ' +
      stageInputs[current].nextElementSibling.firstChild.textContent;
    $('checkpoint-outcome').textContent = t('Final ', '최종 ') + metric;
    showTable(orders[current], outcomes);
  }

  fetch('/research/transcriptome-models/checkpoints.json')
    .then(response => {
      if (!response.ok) throw new Error('Unavailable checkpoint scores');
      return response.json();
    })
    .then(data => {
      render(data);
      task.addEventListener('change', () => render(data));
      stageInputs.forEach(input => input.addEventListener('change', () => render(data)));
      $('checkpoint-interactive').hidden = false;
      $('checkpoint-fallback').hidden = true;
    })
    .catch(() => {
      const message = document.createElement('p');
      message.textContent = t('The checkpoint data could not be loaded. Refresh the page to try again.', '체크포인트 데이터를 불러오지 못했습니다. 새로고침하면 다시 시도합니다.');
      $('checkpoint-fallback').append(message);
    });
})();
