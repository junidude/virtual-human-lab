"""Capture recorded PBISC data in the site's white UI, then encode native 4K MP4s.

Requires Playwright, Pillow and PyAV with libx264. Uses software Chromium and CPU
H.264 only. No inference, embedding fit or statistical analysis is performed.
Run with `uv run --with playwright --with av --with pillow python tools/render_recordings.py`.
"""
from __future__ import annotations

import argparse
from functools import partial
from fractions import Fraction
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import importlib.metadata
from pathlib import Path
import shutil
import threading
import time
from urllib.parse import urlsplit

import av
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'research/pbisc-diffusion/assets/interactive-v1'
WIDTH, HEIGHT, FPS = 3840, 2160, 30
NAMES = {'cells': 'cells', 'single': 'single-cell', 'volcano': 'volcano'}
HTML = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/tools/recording-scene.css">
<title>PBISC recording render</title></head><body><main id="recording"></main>
<script src="/tools/recording-scene.js" defer></script></body></html>'''


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        if urlsplit(self.path).path == '/__recording':
            body = HTML.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *_args) -> None:
        pass


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_hashes() -> dict:
    meta = json.loads((SOURCE / 'manifest.json').read_text())
    hashes = {'manifest.json': sha(SOURCE / 'manifest.json')}
    for file, expected in meta['assets'].items():
        actual = sha(SOURCE / file)
        if actual != expected['sha256']:
            raise ValueError(f'Source data changed: {file}')
        hashes[file] = actual
    return hashes


def capture(kinds: list[str], work: Path, preview: bool) -> dict:
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    captured = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/snap/bin/chromium', headless=True,
                                         args=['--disable-gpu', '--no-sandbox'])
            for kind in kinds:
                directory = work / kind
                directory.mkdir(parents=True, exist_ok=True)
                context = browser.new_context(viewport={'width':1920, 'height':1080}, device_scale_factor=2,
                                              reduced_motion='reduce')
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/__recording?kind={kind}', wait_until='networkidle')
                page.wait_for_function('window.recordingReady === true', timeout=60000)
                page.evaluate('document.fonts.ready')
                frames = []
                for step in ([0, 25, 50] if preview else range(51)):
                    page.evaluate('(step) => window.setRecordingStep(step)', step)
                    page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
                    info = page.evaluate('window.recordingInfo')
                    if errors:
                        raise RuntimeError(errors)
                    if page.evaluate('document.documentElement.scrollWidth > 1920 || document.documentElement.scrollHeight > 1080'):
                        raise ValueError(f'Recording exceeds viewport: {kind}')
                    path = directory / f'{step:03d}.png'
                    page.screenshot(path=str(path), animations='disabled', caret='hide')
                    with Image.open(path) as image:
                        if image.size != (WIDTH, HEIGHT):
                            raise ValueError('Capture is not native 4K')
                    frames.append({'step':step, 'sha256':sha(path), 'info':info})
                    if step % 10 == 0 or preview:
                        print(f'Captured {kind} {step}/50', flush=True)
                captured[kind] = frames
                context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    (work / 'capture.json').write_text(json.dumps(captured, indent=2) + '\n')
    return captured


def durations(kind: str) -> list[int]:
    total, start, each = (900, 60, 15) if kind == 'volcano' else (600, 45, 9)
    return [start] + [each] * 49 + [total - start - each * 49]


def encode(kind: str, work: Path, output: Path) -> dict:
    prefix = NAMES[kind]
    video = output / f'{prefix}-4k.mp4'
    if video.exists():
        raise FileExistsError(f'Use a new output directory rather than overwrite {video}')
    started = time.monotonic()
    counts = durations(kind)
    with av.open(str(video), mode='w', format='mp4', options={'movflags':'+faststart'}) as container:
        stream = container.add_stream('libx264', rate=FPS)
        stream.width, stream.height, stream.pix_fmt = WIDTH, HEIGHT, 'yuv420p'
        stream.options = {'crf':'17', 'preset':'fast'}
        stream.codec_context.thread_count = 4
        stream.codec_context.gop_size = 60
        counter = 0
        for step, copies in enumerate(counts):
            with Image.open(work / kind / f'{step:03d}.png') as source:
                rgb = source.convert('RGB')
                for _ in range(copies):
                    frame = av.VideoFrame.from_image(rgb)
                    frame.pts, frame.time_base = counter, Fraction(1, FPS)
                    for packet in stream.encode(frame):
                        container.mux(packet)
                    counter += 1
            if step % 10 == 0:
                print(f'Encoded {kind} {step}/50', flush=True)
        for packet in stream.encode():
            container.mux(packet)
    if video.stat().st_size >= 25 * 1024 * 1024:
        raise ValueError(f'Video exceeds Pages single-asset limit: {video.stat().st_size}')
    poster = output / f'{prefix}-poster.png'
    shutil.copyfile(work / kind / '050.png', poster)
    sheet = Image.new('RGB', (WIDTH, HEIGHT), 'white')
    for i, step in enumerate([0,10,25,50]):
        with Image.open(work / kind / f'{step:03d}.png') as image:
            sheet.paste(image.convert('RGB').resize((1920,1080), Image.Resampling.LANCZOS), ((i%2)*1920,(i//2)*1080))
    sheet.save(output / f'{prefix}-keyframes.png', optimize=True)
    sheet.save(output / f'{prefix}-keyframes.pdf', resolution=144)
    return {'file': video.name, 'width':WIDTH, 'height':HEIGHT, 'fps':FPS, 'frames':sum(counts),
            'duration_seconds':sum(counts)/FPS, 'bytes':video.stat().st_size, 'sha256':sha(video),
            'codec':'H.264', 'pixel_format':'yuv420p', 'crf':17, 'preset':'fast', 'cpu_threads':4,
            'recorded_state_frames':counts, 'encoding_seconds':round(time.monotonic()-started,2),
            'poster':poster.name, 'keyframes':f'{prefix}-keyframes.png', 'keyframes_pdf':f'{prefix}-keyframes.pdf'}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--kinds', nargs='+', choices=list(NAMES), default=list(NAMES))
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--encode-only', action='store_true')
    args = parser.parse_args()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    sources = source_hashes()
    if not args.encode_only:
        capture(args.kinds, args.work_dir, args.preview)
    if args.preview:
        return
    if not args.output_dir:
        parser.error('--output-dir is required for encoding')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    renders = {}
    for kind in args.kinds:
        renders[kind] = encode(kind, args.work_dir, args.output_dir)
    manifest = {'schema_version':'pbisc.recordings.white-4k.v1', 'source':'../interactive-v1/manifest.json',
                'source_sha256':sources, 'rendered_with':'Native 1920×1080 CSS at device scale 2; software Chromium + CPU libx264',
                'style':'White background, dark controls, Figtree; fixed scientific colors and axes',
                'software':{name:importlib.metadata.version(name) for name in ('av','Pillow','playwright')},
                'new_inference':False, 'new_statistics':False, 'temporal_interpolation':False,
                'frame_semantics':'51 recorded states. At the last state, PCA/single use t=0; UMAP/volcano repeat the t=.02 prediction.',
                'render_code_sha256':{str(p.relative_to(ROOT)):sha(p) for p in [Path(__file__),ROOT/'tools/recording-scene.js',ROOT/'tools/recording-scene.css']},
                'videos':renders}
    (args.output_dir / 'render-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'status':'RENDERED', 'videos':renders}, indent=2), flush=True)


if __name__ == '__main__':
    main()
