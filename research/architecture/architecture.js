/* Small, shared playback shell. The two model diagrams keep their own semantics. */
const ko = document.documentElement.lang === 'ko';
const text = ko ? {
  play: '재생', pause: '일시정지', reset: '처음부터', slider: '구조도 애니메이션 단계',
  failed: '애니메이션을 불러오지 못했습니다. 새로고침해 주세요.',
} : {
  play: 'Play', pause: 'Pause', reset: 'Restart', slider: 'Architecture animation step',
  failed: 'The animation could not load. Please refresh to try again.',
};

async function mount(section) {
  const visual = section.querySelector('.architecture-visual');
  const status = section.querySelector('.arch-status');
  try {
    const kind = section.dataset.architecture;
    const module = kind === 'diffusion' ? await import('./diffusion.js?v=20260922-copy-49cb83414f') : await import('./talk.js?v=20260922-copy-3bc9f71374');
    const model = await (kind === 'diffusion' ? module.mountDiffusion : module.mountTalk)(visual, {ko});
    const footer = document.createElement('div');
    footer.className = 'arch-controls';
    footer.innerHTML = `<button class="arch-play" type="button"></button>
      <button class="arch-reset" type="button">${text.reset}</button>
      <input class="arch-slider" type="range" min="0" max="${model.frameCount - 1}" step="1" aria-label="${text.slider}">
      <div class="arch-position"><span class="arch-stage"></span><output class="arch-readout"></output></div>`;
    section.querySelector('.architecture-card').append(footer);
    const play = footer.querySelector('.arch-play');
    const slider = footer.querySelector('.arch-slider');
    const stage = footer.querySelector('.arch-stage');
    const readout = footer.querySelector('.arch-readout');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = reduce.matches ? model.frameCount - 1 : 0;
    let playing = !reduce.matches;
    let visible = false;
    let timer = null;

    function draw(next) {
      frame = Math.max(0, Math.min(model.frameCount - 1, next));
      model.draw(frame);
      section.dataset.frame = String(frame);
      slider.value = String(frame);
      readout.textContent = model.frameLabel(frame);
      stage.textContent = model.stageLabel(frame);
      slider.setAttribute('aria-valuetext', `${stage.textContent} · ${readout.textContent}`);
    }
    function schedule() {
      clearTimeout(timer);
      timer = null;
      play.textContent = playing ? text.pause : text.play;
      play.setAttribute('aria-pressed', String(playing));
      section.dataset.playing = String(playing);
      if (!playing || !visible || document.hidden) return;
      timer = setTimeout(() => {
        draw(frame === model.frameCount - 1 ? 0 : frame + 1);
        schedule();
      }, frame === model.frameCount - 1 ? 2000 : (kind === 'diffusion' ? 220 : 100));
    }
    play.addEventListener('click', () => {
      playing = !playing;
      if (playing && frame === model.frameCount - 1) draw(0);
      schedule();
    });
    footer.querySelector('.arch-reset').addEventListener('click', () => {
      playing = false;
      draw(0);
      schedule();
    });
    slider.addEventListener('input', () => {
      playing = false;
      draw(Number(slider.value));
      schedule();
    });
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      schedule();
    }, {threshold: 0});
    observer.observe(visual);
    document.addEventListener('visibilitychange', schedule);
    reduce.addEventListener('change', () => {
      if (reduce.matches) { playing = false; schedule(); }
    });
    draw(frame);
    schedule();
    status.hidden = true;
    section.dataset.ready = 'true';
  } catch (error) {
    status.textContent = text.failed;
    status.hidden = false;
    section.dataset.ready = 'error';
  }
}

document.querySelectorAll('[data-architecture]').forEach(mount);
