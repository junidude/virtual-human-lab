(() => {
  'use strict';
  const app = document.getElementById('recipe-guide-app');
  if (!app) return;
  const ko = document.documentElement.lang === 'ko';
  const t = (en, kr) => ko ? kr : en;
  const genes = ['A', 'B', 'C', 'D', 'E', 'F'];
  const amount = {A: 3, B: 0, C: 20, D: 7, E: 1, F: 12};
  const ink = {A: '#b8a5fa', B: '#e7bb6c', C: '#55d5ce', D: '#ff9a83', E: '#a9d782', F: '#80b9ff'};
  const abundance = ['C', 'F', 'D', 'A', 'E'];
  const relativeSC = ['D', 'A', 'F', 'C', 'E'];
  const relativeBulk = ['D', 'A', 'F', 'E', 'C', 'B'];
  const scBins = {A: 2, B: 0, C: 4, D: 3, E: 1, F: 3};
  const bulkBins = {A: 19, B: 0, C: 42, D: 29, E: 10, F: 36};
  const quantiles = {A: 13, B: 0, C: 50, D: 25, E: 1, F: 37};
  const recipes = {sc: ['Presence', 'Identity', 'GPT', 'Bin-Class', 'Bin-Value', 'Value'], bulk: ['Identity', 'GPT', 'Bin-Class', 'Value']};
  const glyphs = {
    Presence: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M9 7l10 5-10 5"/><circle cx="21" cy="12" r="3"/>',
    Identity: '<rect x="2" y="7" width="6" height="10" rx="2"/><rect x="11" y="7" width="6" height="10" rx="2" stroke-dasharray="2 2"/><rect x="20" y="7" width="6" height="10" rx="2"/>',
    GPT: '<path d="M3 17h21m-5-4 5 4-5 4M4 13q6-13 12 0M8 13q6-17 12 0"/>',
    'Bin-Class': '<path d="M2 20h6v-4h6v-5h6V5h6"/><path d="M5 5v7m7-7v4"/>',
    'Bin-Value': '<path d="M2 14h24M4 11v6m5-6v6m5-8v10m5-8v6m5-6v6"/><circle cx="17" cy="6" r="2"/>',
    Value: '<path d="M2 14c3 0 3-8 6-8s3 12 6 12 3-10 6-10 3 5 6 5"/>'
  };
  const titles = {
    Presence: t('Which genes were detected?', '어떤 유전자가 검출됐을까?'),
    Identity: t('Which gene belongs here?', '이 자리에 들어갈 유전자는?'),
    GPT: t('Which gene comes next?', '다음에 올 유전자는?'),
    'Bin-Class': t('Which expression bin is missing?', '가려진 발현 구간은?'),
    'Bin-Value': t('Where on the expression scale?', '발현량이 몇 번째 구간에 속할까?'),
    Value: t('How much was expressed?', '이 유전자의 발현량은?')
  };
  const designSource = {
    sc: {
      Presence: t('UCE’s use of detected and unexpressed genes for supervision', 'UCE의 유전자 검출 여부 학습'),
      Identity: t('Geneformer’s ranked gene IDs and masked-ID prediction', 'Geneformer의 순위 기반 유전자 ID 입력과 가린 ID 예측'),
      GPT: t('tGPT’s next-gene prediction on expression-ranked IDs', 'tGPT의 발현 순위에 따른 다음 유전자 예측'),
      'Bin-Class': t('scBERT’s discretized expression input', 'scBERT의 구간화된 발현량 입력'),
      'Bin-Value': t('scGPT’s within-cell expression bins', 'scGPT의 세포 내 발현량 구간화'),
      Value: t('CellFM’s reconstruction of continuous expression values', 'CellFM의 연속 발현량 복원')
    },
    bulk: {
      Identity: t('GeneRAIN’s gene-specific ranking against a training reference', 'GeneRAIN의 학습 분포 기준 유전자별 순위화'),
      GPT: t('GeneRAIN’s gene-specific ranking against a training reference', 'GeneRAIN의 학습 분포 기준 유전자별 순위화'),
      'Bin-Class': t('BulkRNABert’s discretized bulk expression input', 'BulkRNABert의 구간화된 bulk 발현량 입력'),
      Value: t('BulkFormer’s continuous bulk expression encoding', 'BulkFormer의 연속 bulk 발현량 인코딩')
    }
  };
  let modality = 'sc';
  let recipe = 'Presence';
  let alternate = false;
  let revealed = false;
  const single = () => modality === 'sc';
  const svg = (width, height, drawing) => '<svg viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true" focusable="false">' + drawing + '</svg>';
  const text = (x, y, value, cls = '', anchor = 'middle') => '<text x="' + x + '" y="' + y + '" class="' + cls + '" text-anchor="' + anchor + '">' + value + '</text>';
  const path = (d, cls) => '<path d="' + d + '" class="' + cls + '"/>';
  const rect = (x,y,w,h,rx,cls,fill='') => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" class="' + cls + '"' + (fill ? ' style="fill:' + fill + '"' : '') + '/>';
  const shortLog = gene => Math.log1p(amount[gene]).toFixed(2);
  const classBin = gene => (single() ? scBins : bulkBins)[gene];
  const sortOrder = () => single() ? (recipe === 'GPT' ? abundance : relativeSC) : relativeBulk;

  function target() {
    if (recipe === 'Presence') return alternate ? 'B' : 'D';
    if (recipe === 'Identity') return alternate ? 'C' : 'F';
    if (recipe === 'GPT') return single() ? (alternate ? 'E' : 'D') : (alternate ? 'B' : 'F');
    return alternate ? (single() ? 'A' : 'B') : 'D';
  }

  function profile(query) {
    const parts = [];
    for (const tick of [0,10,20]) {
      const y = 135 - 4.6*tick;
      parts.push(path('M23 '+y+'H294','rg-measure-line'),text(17,y+4,tick,'rg-axis','end'));
    }
    genes.forEach((gene,i) => {
      const x = 44 + i*46;
      const h = amount[gene]*4.6;
      if (gene === query) parts.push(rect(x-19,19,38,137,8,'rg-gene-band'));
      if (h) {
        parts.push(rect(x-10,135-h,20,h,4,'rg-bar',ink[gene]));
        parts.push(rect(x-10,135-h,20,Math.min(5,h),2,'rg-bar-cap'));
      } else {
        parts.push('<circle cx="'+x+'" cy="135" r="3" class="rg-zero"/>');
      }
      parts.push(text(x,126-h,amount[gene],'rg-reading'),text(x,151,gene,'rg-gene'));
    });
    return svg(310,162,parts.join(''));
  }

  function chip(x,y,gene,hidden=false,w=34,h=30) {
    const color = hidden ? '' : ink[gene];
    return rect(x-w/2,y-h/2,w,h,6,hidden ? 'rg-mask' : 'rg-chip',color) +
      text(x,y+5,hidden ? '?' : gene,hidden ? 'rg-mask-text' : 'rg-chip-text');
  }

  function presence(query) {
    const spots = [[30,54],[82,39],[34,123],[86,133]];
    const visible = ['A','C','E','F'];
    let links='', nodes='';
    spots.forEach(([x,y],i) => {
      links+=path('M'+x+' '+y+'Q110 '+y+' 154 89','rg-wire');
      nodes+=chip(x,y,visible[i],false,26,25);
    });
    const pool=rect(139,70,53,38,12,'rg-module') +
      [11,21,16,25,13].map((h,i)=>rect(148+i*7,89-h/2,4,h,2,'rg-signal')).join('');
    return svg(360,170,links+nodes+pool+
      path('M193 89H221Q236 89 247 96L281 110','rg-wire-bright')+
      path('M224 45Q253 45 259 72L281 110','rg-wire-bright')+
      chip(222,42,query,false,28,27)+
      text(250,20,t('Query gene','질의 유전자'),'rg-annotation')+
      rect(281,94,49,31,15,'rg-mask')+text(305,115,'?','rg-mask-text')+
      text(165,133,t('Pooled IDs','ID 통합'),'rg-annotation'));
  }

  function sequence(query) {
    const causal = recipe === 'GPT';
    const order = sortOrder();
    const index = order.indexOf(query);
    const shown = causal ? order.slice(0,index+1) : order;
    const dx = Math.min(56,300/(shown.length-1 || 1));
    const start = 180 - (shown.length-1)*dx/2;
    let strokes='', nodes='';
    shown.forEach((gene,i)=>{
      const x=start+i*dx, y=96;
      if (i < shown.length-1) strokes+=path('M'+(x+15)+' '+y+'h'+(dx-30),'rg-wire');
      if (causal && i < index) {
        const end=start+dx*index;
        const top=65-(index-i)*6;
        strokes+=path('M'+x+' 77Q'+((x+end)/2)+' '+top+' '+(end-2)+' 77','rg-wire-bright');
      }
      nodes+=chip(x,y,gene,gene===query,36,34);
      if (causal && gene === query) {
        strokes+=path('M'+(x-dx/2)+' 65v63','rg-boundary');
        nodes+=text(x,133,t('Next','다음'),'rg-annotation');
      } else {
        nodes+=text(x,132,i+1,'rg-ruler-text');
      }
    });
    const tx = start+index*dx;
    return svg(360,170,strokes+nodes+text(180,28,
      single()
        ? (causal ? t('Ordered by expression in this cell','이 세포의 발현량 순') : t('Ordered by median-scaled expression','유전자별 중앙값 대비 발현량 순'))
        : t('Ordered by training-reference score','유전자별 학습 분포 기준 점수 순'),'rg-annotation')+
      path('M'+(tx-11)+' 151h22','rg-target-mark'));
  }

  function bins(query) {
    const quantile = recipe === 'Bin-Value';
    const order = single() ? [...abundance,'B'] : genes;
    let drawing='';
    order.forEach((gene,i)=>{
      const x=39+i*56;
      const hidden=gene===query;
      drawing+=chip(x,49,gene,false,31,25);
      drawing+=path('M'+x+' 63v13','rg-wire');
      drawing+=rect(x-18,77,36,29,5,hidden ? 'rg-mask' : 'rg-module');
      drawing+=text(x,97,hidden ? '?' : (quantile ? quantiles[gene] : classBin(gene)),hidden ? 'rg-mask-text' : 'rg-light-number');
    });
    if (quantile) {
      for(let i=0;i<50;i++) {
        const x=32+i*5.98;
        drawing+=path('M'+x+' 131v'+(i%5===0 ? 9 : 5),'rg-scale-tick');
      }
      drawing+=text(32,156,'1','rg-annotation')+text(326,156,'50','rg-annotation')+
        text(180,156,t('Positive-expression quantiles','양의 발현량 분위 구간'),'rg-annotation');
    } else {
      const count=single() ? 6 : 65;
      const width=290/count;
      for(let i=0;i<count;i++) {
        drawing+=rect(35+i*width,129,Math.max(1,width-(single() ? 3 : 1)),10,1,'rg-level',
          'hsl('+(218-i/(count-1)*42)+' 72% '+(32+i/(count-1)*42)+'%)');
      }
      drawing+=text(35,156,0,'rg-annotation')+text(325,156,count-1,'rg-annotation')+
        text(180,156,t('Expression categories','발현 범주'),'rg-annotation');
    }
    return svg(360,170,drawing);
  }

  function continuous(query) {
    const order=single() ? [...abundance,'B'] : genes;
    let drawing='';
    order.forEach((gene,i)=>{
      const x=39+i*56; const hidden=gene===query;
      drawing+=chip(x,48,gene,false,31,25);
      drawing+=path('M'+x+' 62v13','rg-wire');
      if(hidden) {
        drawing+=rect(x-21,75,42,48,6,'rg-mask');
        drawing+=text(x,104,single() ? 'M' : '0','rg-mask-text');
      } else if(single()) {
        const h=Math.log1p(amount[gene])*13;
        if (h > 0) drawing+=rect(x-12,118-h,24,h,3,'rg-log-bar',ink[gene]);
        drawing+=text(x,143,shortLog(gene),'rg-annotation');
      } else {
        drawing+=rect(x-21,75,42,48,6,'rg-module');
        // Each row shows a sine/cosine pair at example frequencies.
        [0,64,128].forEach((channel,row) => {
          const a=Math.log1p(amount[gene])/100**(2*channel/512);
          const y=79+row*13;
          drawing+=rect(x-16,y,14,9,2,'rg-channel','hsl(192 75% '+(49+Math.sin(a)*25)+'%)');
          drawing+=rect(x+2,y,14,9,2,'rg-channel','hsl(249 75% '+(49+Math.cos(a)*25)+'%)');
        });
      }
    });
    drawing+=text(180,single() ? 17 : 149,single() ? t('Continuous values + gene IDs','연속값과 유전자 ID') : t('Sine / cosine channels · schematic','사인 / 코사인 채널 · 모식도'),'rg-annotation');
    return svg(360,170,drawing);
  }

  function lesson(gene) {
    if (recipe === 'Presence') {
      return {
        kind:t('Binary classification','이진 분류'), target:t('Was gene '+gene+' detected?', '유전자 '+gene+'가 검출됐을까요?'),
        answer: amount[gene] ? t('Yes · detected','예 · 검출됨') : t('No · measured zero','아니요 · 측정값 0'),
        input:t('Four visible gene IDs are pooled. The queried ID is supplied separately.', '보이는 유전자 ID 네 개를 통합하고, 질의할 ID는 따로 입력합니다.'),
        detail:t('The visible set always excludes D in this example. D is a hidden positive and B has measured zero expression. Training compares such queries against the pooled context and uses binary cross-entropy.', '이 예시의 입력 집합에서는 양의 발현값을 가진 D를 숨겼고 B의 측정값은 0입니다. 모델은 질의할 유전자와 통합된 입력을 바탕으로 검출 여부를 예측합니다. 손실은 이진 교차 엔트로피입니다.'),
        explain:t('The measured value is '+amount[gene]+' CP10K.', '측정 발현량은 '+amount[gene]+' CP10K입니다.')
      };
    }
    if (recipe === 'Identity' || recipe === 'GPT') {
      const identity=recipe==='Identity', order=sortOrder();
      const mechanism = single()
        ? (identity ? t('Positive genes are ordered by expression relative to their training medians.', '발현된 유전자를 학습 데이터의 유전자별 중앙값 대비 발현량 순으로 정렬합니다.') : t('Detected genes are ordered by their expression in this cell.', '검출된 유전자를 이 세포에서 발현량이 높은 순으로 정렬합니다.'))
        : t('Gene order comes from gene-specific training distributions. A measured zero can appear at the end.', '유전자별 학습 분포를 기준으로 순서를 정합니다. 측정값이 0인 유전자도 끝에 올 수 있습니다.');
      const op=identity
        ? t('A gene ID is masked. Recover its identity from the surrounding IDs.', '유전자 ID 하나를 가렸습니다. 앞뒤 ID를 보고 가려진 유전자를 복원합니다.')
        : t('Only the prefix is visible. Predict the next gene ID.', '앞부분의 ID만 보입니다. 이어질 유전자 ID를 예측합니다.');
      let reference = '';
      if (single() && identity) reference=t(' The toy training medians for A, C, D, E and F are 1, 16, 1, 2 and 6 CP10K.', ' 이 예시에서 A, C, D, E, F의 학습 중앙값은 각각 1, 16, 1, 2, 6 CP10K입니다.');
      if (!single()) reference=t(' Illustrative training-reference scores are D 1700, A 1400, F 1200, E 700, C 300 and B 1.', ' 이 그림에서 가정한 학습 분포 기준 점수는 D 1700, A 1400, F 1200, E 700, C 300, B 1입니다.');
      return {kind:t('ID classification','ID 분류'),input:op,
        target:identity ? t('Recover the hidden ID at position '+(order.indexOf(gene)+1)+'.', (order.indexOf(gene)+1)+'번째 위치에서 가려진 ID를 복원하세요.')
          : t('Which ID follows '+order[order.indexOf(gene)-1]+'?', order[order.indexOf(gene)-1]+' 다음에 올 ID는?'),answer:t('Gene ','유전자 ')+gene,
        detail:mechanism+reference+t(' The loss is cross-entropy over gene identities.', ' 손실은 유전자 ID에 대한 교차 엔트로피입니다.'),
        explain:t('Position '+(order.indexOf(gene)+1)+' in the ordered sequence.', '정렬한 목록의 '+(order.indexOf(gene)+1)+'번째 유전자입니다.')};
    }
    if (recipe === 'Bin-Class' || recipe === 'Bin-Value') {
      const category=recipe==='Bin-Class';
      const range=single() ? (category ? '1–5':'1–50') : '0–64';
      const val=category ? classBin(gene) : quantiles[gene];
      const context = single() ? (category
        ? t('Positive CP10K values are transformed with log₂(1 + expression), rounded down and clipped to bins 1–5. Zero retains bin 0. Training hides a positive value and uses cross-entropy to classify its bin.', '양의 CP10K에 log₂(1 + 발현량)를 적용한 뒤 내림하고 1–5 구간으로 제한합니다. 측정값 0은 구간 0에 둡니다. 양의 발현 구간을 숨기고 교차 엔트로피로 범주를 학습합니다.')
        : t('These five genes supply all the positive values used to set the example’s bin boundaries. Their log-expression values define within-cell quantile boundaries. The model regresses the hidden bin number using mean squared error.', '이 예시에서는 양수인 다섯 유전자의 로그 발현값으로 세포 내 분위 경계를 정합니다. 숨겨진 구간 번호를 평균제곱오차로 학습합니다.'))
        : t('Gene positions are fixed. Each log₁₀(1 + TPM) is scaled using a training reference (maximum 2 in this example). Positive values map to 64 bins and zero maps to bin 0. Cross-entropy trains the classifier, including zero targets.', '유전자 위치는 고정되어 있습니다. log₁₀(1 + TPM)을 학습 데이터 기준으로 조정합니다(예시의 최댓값은 2). 양의 값은 64개 구간, 0은 구간 0에 배정합니다. 0도 예측 대상이며 손실은 교차 엔트로피입니다.');
      return {kind:category ? t('Bin classification','구간 분류') : t('Bin-index regression','구간 번호 회귀'),
        input:category ? t('Gene IDs stay visible. The value of '+gene+' is hidden after binning.', '유전자 ID를 유지하고, 발현량을 구간으로 바꾼 뒤 '+gene+'의 구간을 가립니다.') : t('The visible numbers are within-cell quantile bins. One bin index is hidden.', '보이는 숫자는 세포 내 발현량의 분위 구간입니다. 그중 한 구간의 번호를 가립니다.'),
        target:category ? t('Which category contains '+gene+'?', '유전자 '+gene+'의 발현 구간은?') : t('What is the numeric bin for '+gene+'?', '유전자 '+gene+'의 분위 구간 번호는?'),
        answer:t('Bin ','구간 ')+val,detail:context,
        explain:category ? t('The model classifies the bin for the observed value '+amount[gene]+'.', '측정값 '+amount[gene]+'이 속하는 범주를 분류합니다.') : t('The model predicts a number on the '+range+' scale.', range+' 범위에서 구간 번호를 회귀로 예측합니다.')};
    }
    return {kind:t('Expression regression','발현량 회귀'),
      input:single() ? t('Gene IDs stay visible. A learned mask (M) replaces one positive expression value.', '유전자 ID는 유지하고 양의 발현값 하나를 학습 가능한 마스크(M)로 바꿉니다.') : t('Fixed gene IDs remain. The selected value’s sine/cosine channels are set to zero.', '고정된 유전자 ID는 그대로 두고, 선택한 발현값의 사인·코사인 채널을 전부 0으로 만듭니다.'),
      target:t('What was the log-expression of '+gene+'?', '가려진 '+gene+'의 로그 발현량은?'),answer:'ln(1 + '+amount[gene]+') ≈ '+shortLog(gene),
      detail:single() ? t('The target is the original ln(1 + CP10K). The model reconstructs positive expression with a continuous output and mean squared error.', '정답은 원래의 ln(1 + CP10K)입니다. 양의 발현량을 연속값으로 복원하며 손실은 평균제곱오차입니다.')
        : t('The drawing shows three illustrative frequency pairs. The actual value encoding has 256 sine and 256 cosine channels. Genuine zero expression gives cosine values of one, while masking zeros the entire value vector. The target is ln(1 + TPM) and the loss is mean squared error.', '그림은 세 주파수 쌍을 예시로 보여줍니다. 실제 인코딩은 사인과 코사인 채널이 각각 256개입니다. 실제 측정값이 0이면 코사인 채널은 1이고, 값을 가린 경우에는 모든 채널이 0입니다. ln(1 + TPM)을 평균제곱오차로 예측합니다.'),
      explain:t('A continuous expression value, rounded here to two decimals.', '연속 발현값을 소수 둘째 자리까지 표시했습니다.')};
  }

  app.innerHTML =
    '<div class="rg-controls"><fieldset class="rg-modality"><legend>'+t('RNA input','RNA 입력')+'</legend><div class="rg-mode-options">'+
    [['sc',t('Single cell','단일세포')],['bulk','Bulk RNA']].map(([id,label])=>'<label><input type="radio" name="recipe-modality" value="'+id+'"'+(id==='sc'?' checked':'')+'><span>'+label+'</span></label>').join('')+
    '</div></fieldset><fieldset class="rg-choice"><legend class="sr-only">'+t('Training recipe','학습 방식')+'</legend><div class="rg-recipe-options"></div></fieldset></div>'+
    '<figure id="recipe-guide-figure" class="rg-figure" aria-labelledby="rg-title" aria-describedby="rg-operation rg-transcript">'+
      '<header class="rg-lead"><h3 id="rg-title"></h3><span id="rg-kind"></span></header>'+
      '<div class="rg-panels"><section class="rg-source"><h4 id="rg-source-title"></h4><p class="rg-unit" id="rg-unit"></p><div id="rg-profile"></div><p id="rg-source-note"></p></section>'+
      '<section class="rg-encoding"><h4>'+t('Model input','모델 입력')+'</h4><div id="rg-visual"></div><p id="rg-operation"></p></section></div>'+
      '<p class="sr-only" id="rg-transcript"></p><figcaption class="rg-target"><div class="rg-target-copy"><p id="rg-prompt" aria-live="polite" aria-atomic="true"></p><p class="rg-answer" id="rg-answer" aria-live="polite"></p></div><div class="rg-actions">'+
      '<button id="recipe-guide-reveal" type="button" aria-pressed="false" aria-controls="rg-answer"></button>'+
      '<button id="recipe-guide-example" type="button">'+t('Switch target gene','대상 유전자 바꾸기')+'</button></div></figcaption>'+
    '</figure><details class="rg-method"><summary>'+t('How this recipe works','이 방식의 학습 원리')+'</summary><p id="rg-detail"></p></details>';
  const find = selector => app.querySelector(selector);

  function menu() {
    find('.rg-recipe-options').innerHTML = recipes[modality].map(key =>
      '<label><input type="radio" name="recipe-choice" value="'+key+'"'+(key===recipe?' checked':'')+'><span>'+svg(28,24,glyphs[key])+key+'</span></label>'
    ).join('');
  }

  function describeInput(gene) {
    if (recipe === 'Presence') return t('Visible IDs A, C, E and F. Query ', '보이는 ID는 A, C, E, F이고 질의 유전자는 ') + gene + '.';
    if (recipe === 'Identity' || recipe === 'GPT') {
      const order = sortOrder();
      const shown = recipe === 'GPT' ? order.slice(0,order.indexOf(gene)+1) : order;
      return t('Input sequence: ', '입력 순서: ') + shown.map(id => id === gene ? '?' : id).join(', ') + '.';
    }
    const order = single() ? [...abundance,'B'] : genes;
    return t('Input by gene: ', '유전자별 입력: ') + order.map(id => {
      if (id === gene) return id + ' ' + t('masked', '마스크');
      if (recipe === 'Bin-Class') return id + ' ' + classBin(id);
      if (recipe === 'Bin-Value') return id + ' ' + quantiles[id];
      return id + ' ' + shortLog(id);
    }).join(', ') + '.';
  }

  function showSource(gene) {
    const hideID = !revealed && (recipe === 'Identity' || recipe === 'GPT');
    find('#rg-profile').innerHTML = profile(hideID ? null : gene);
    find('#rg-source-note').textContent = hideID
      ? t('Six illustrative gene measurements','가상 유전자 6개의 발현값')
      : t('Illustrative profile · target gene '+gene,'가상 발현 예시 · 대상 유전자 '+gene);
  }

  function updateAnswer() {
    const info=lesson(target());
    showSource(target());
    const button=find('#recipe-guide-reveal');
    button.setAttribute('aria-pressed',String(revealed));
    button.textContent = revealed ? t('Hide target','정답 숨기기') : t('Reveal target','학습 정답 보기');
    const answer=find('#rg-answer');
    answer.replaceChildren();
    if(revealed) {
      const strong=document.createElement('strong');
      strong.textContent=info.answer;
      answer.append(strong, ' · '+info.explain);
    }
  }

  function render() {
    const query=target(), info=lesson(query);
    app.dataset.modality=modality;
    app.dataset.recipe=recipe;
    app.dataset.target=query;
    find('#recipe-guide-figure').dataset.recipe=recipe;
    find('#rg-title').textContent=titles[recipe];
    find('#rg-kind').textContent=info.kind;
    find('#rg-source-title').textContent=single() ? t('Example cell','단일세포 예시') : t('Example bulk sample','Bulk RNA 샘플 예시');
    find('#rg-unit').textContent=single() ? t('Normalized expression · CP10K','정규화 발현량 · CP10K') : t('Normalized expression · TPM','정규화 발현량 · TPM');
    find('#rg-transcript').textContent=t('Source values: ','원래 발현값: ')+genes.map(id=>id+' '+amount[id]).join(', ')+'. '+describeInput(query);
    const graphics={Presence:presence,Identity:sequence,GPT:sequence,'Bin-Class':bins,'Bin-Value':bins,Value:continuous};
    find('#rg-visual').innerHTML=graphics[recipe](query);
    find('#rg-operation').textContent=info.input;
    find('#rg-prompt').textContent=info.target;
    const source = designSource[modality][recipe];
    find('#rg-detail').textContent=info.detail+' '+t('We trained this encoder for the study, drawing on '+source+'.', '이 연구에서는 '+source+' 방식을 참고해 인코더를 학습했습니다.');
    updateAnswer();
  }

  app.addEventListener('change', event => {
    const radio=event.target;
    if(radio.name==='recipe-modality') {
      modality=radio.value;
      if(!recipes[modality].includes(recipe)) recipe=recipes[modality][0];
      menu();
    } else if(radio.name==='recipe-choice') {
      recipe=radio.value;
    } else return;
    revealed=false;
    alternate=false;
    render();
  });
  find('#recipe-guide-reveal').addEventListener('click',()=>{revealed=!revealed;updateAnswer();});
  find('#recipe-guide-example').addEventListener('click',()=>{alternate=!alternate;revealed=false;render();});
  menu();
  render();
  app.hidden=false;
  const fallback=document.getElementById('recipe-guide-fallback');
  if(fallback) fallback.hidden=true;
})();
