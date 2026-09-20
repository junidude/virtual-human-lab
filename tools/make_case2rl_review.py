#!/usr/bin/env python3
"""Export the two owner-requested recorded rollouts, not their source PDF/figures.

The case configuration is private and stays private. This fixed allowlist
exports recorded diagnostic exchanges for review, as requested by the owner.
No inference, API calls, review writes, or source-repository changes.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import yaml

RUNS = (
 ('20260918T224112Z-deepseek-flash-000.json', 17, '511767be6fd8829f2d46efdce7be12e058f100611684b7983401c0ed3010c988'),
 ('20260918T224152Z-deepseek-v4-pro-000.json', 14, '0386113a4cbb7470eddf177d50f2ddb61c744d6380b262f0ef8b2705ed03e23b'),
)
CONFIG = dict(dx_weight=3.0, cost_weight=.5, cost_scale_usd=10000.0,
              hallucination_penalty=2.0, missed_red_flag_penalty=3.0,
              contraindicated_penalty=3.0, rejected_action_penalty=.1, no_diagnosis_penalty=1.0)

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def write(path: Path, data: dict) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if '/home/' in payload or 'api_key' in payload.lower() or 'Authorization:' in payload:
        raise ValueError('Unexpected private path or credential field in public export')
    path.write_text(payload)

def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'research/case2rl/assets/review-v1')
    args = p.parse_args()
    sys.dont_write_bytecode = True
    args.output.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location('case2rl_review_normalizer', args.source / 'apps/review/server.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    runs_root = args.source / 'runs'
    entries, normalized, input_hashes = [], [], {}
    for i, (name, count, expected_sha) in enumerate(RUNS):
        path = runs_root / 'igg4-sialadenitis' / name
        assert sha(path) == expected_sha, 'Source rollout changed; inspect before re-exporting'
        original = json.loads(path.read_text())
        cp = Path(original['case_path'])
        cp = cp / 'case.yaml' if cp.is_dir() else cp
        case = yaml.safe_load(cp.read_text())
        run = module.normalize_run(path, runs_root)
        assert len(run['turns']) == count and run['reward']['complete'] is True
        assert run['candidate_label'] == f'Candidate {chr(65+i)}'
        assert run['final']['diagnosis'] == original['result']['diagnosis']
        assert run['final']['rationale'] == original['result']['rationale']
        assert run['reward'] == original['result']['reward']
        assert [t['turn'] for t in run['turns']] == list(range(1, count + 1))
        assert run['source_counts'] == {'history': 16, 'findings': 44}
        assert case['source']['doi'] == '10.1056/NEJMcpc0902221'
        reward = run['reward']
        assert abs(reward['dx_term'] - 3 * (reward['dx_score'] - 1) / 4) < 1e-12
        assert abs(reward['cost_term'] - .5 * min(1, reward['cost_usd'] / 10000)) < 1e-12
        assert abs(reward['total'] - (reward['dx_term'] - reward['cost_term'] - reward['penalty_total'])) < 1e-12
        # Byte-preserving response/action equality is checked before exporting.
        ledger_turns = original['result']['ledger']['turns']
        for t, raw in zip(run['turns'], ledger_turns):
            assert t['action'] == raw.get('action')
            assert len(t['exchanges']) == len(raw['exchanges'])
            for exchange, raw_exchange in zip(t['exchanges'], raw['exchanges']):
                assert exchange['response'] == raw_exchange['response']
                assert exchange['request'] == raw_exchange['request']
                assert exchange['generated_text'] == raw_exchange.get('generated_text')
        counts = Counter(e['provenance'] for t in run['turns'] for e in t['exchanges'])
        run.update(run_sha256=expected_sha, case_sha256=sha(cp), case_label='Case 24-2009',
                   provenance_counts=dict(counts), reward_config=CONFIG)
        run.pop('error', None)
        filename = f'run-{chr(97+i)}.json'
        write(args.output / filename, run)
        entries.append({**{key: run[key] for key in ('id','candidate_label','model','case_label','started_at','finished_at','run_sha256','cost_usd')},
            'case_id':run['case']['id'], 'turns': count, 'file':filename,
            'file_sha256':sha(args.output / filename), 'reward':reward['total'], 'dx_score':reward['dx_score'],
            'complete':reward['complete'], 'penalty_count':len(reward['penalties'])})
        normalized.append(run)
        input_hashes[name] = expected_sha

    examples = []
    for i, run in enumerate(normalized):
        for turn in run['turns']:
            for exchange in turn['exchanges']:
                request = exchange['request'].lower()
                if exchange['provenance'] == 'generated' and ('sedimentation' in request or request.strip() == 'esr'):
                    assert not exchange['source_ids']
                    examples.append(dict(kind='missing', candidate_label=run['candidate_label'], turn=turn['turn'],
                                         request=exchange['request'], response=exchange['response'],
                                         generated_text=exchange['generated_text'], source_ids=[], provenance='generated'))
                if exchange['provenance'] == 'mixed' and ('differential' in request or 'cbc' in request):
                    if not any(e['kind']=='mixed' for e in examples):
                        examples.append(dict(kind='mixed',candidate_label=run['candidate_label'],turn=turn['turn'],
                            request=exchange['request'],response=exchange['response'],generated_text=exchange['generated_text'],
                            source_ids=exchange['source_ids'],sources=exchange['sources'],provenance='mixed'))
                if exchange['provenance'] == 'refused':
                    examples.append(dict(kind='refused',candidate_label=run['candidate_label'],turn=turn['turn'],
                        request=exchange['request'],response=exchange['response'],notes=exchange['notes'],
                        source_ids=exchange['source_ids'],provenance='refused'))
    assert len([e for e in examples if e['kind']=='missing']) == 2
    story = dict(schema_version='case2rl.public-story.v1',
        paper=dict(title='Case 24-2009: A 26-year-old woman with painful swelling of the neck',
                   authors='Stone JH, Caruso PA, Deshpande V', journal='N Engl J Med 2009;361:511–518',
                   doi='10.1056/NEJMcpc0902221', url='https://www.nejm.org/doi/10.1056/NEJMcpc0902221',
                   description_en='A young woman with bilateral submandibular swelling. The case connects history, laboratory results, neck imaging and tissue findings.',
                   description_ko='양측 턱밑샘이 부은 젊은 여성의 증례. 병력·검사·목 영상·조직 소견을 연결합니다.',
                   visual='case-schematic.svg', visual_kind='Original schematic; not a patient photograph',
                   original_report_assets_bundled=False),
        source_counts=dict(history=16,findings=44), examples=examples, reward_config=CONFIG,
        runs=[dict(candidate_label=r['candidate_label'],turns=len(r['turns']),cost_usd=r['cost_usd'],
                   reward=r['reward'],provenance_counts=r['provenance_counts']) for r in normalized],
        interpretation=dict(generated='Simulator completions are not observed patient measurements and are not automatically candidate hallucinations.',
                            reward='Recorded configured reward; default weights and modeled prices await calibration.',
                            what_if='Reweighting the same fixed traces; no new generation or judge call.'))
    write(args.output / 'story.json', story)
    manifest = dict(schema_version='case2rl.public-review-manifest.v1',runs=entries,
        story=dict(file='story.json',sha256=sha(args.output/'story.json')),
        publication_scope='Owner-requested recorded action/response review; original paper PDF and original figures are not bundled.',
        storage='Browser-local append-only snapshots with portable JSON; no shared submission backend.',
        source_normalizer_sha256=sha(args.source/'apps/review/server.py'), exporter_sha256=sha(Path(__file__)),
        new_model_calls=0, source_rollouts_unchanged=True)
    write(args.output/'manifest.json', manifest)
    print(json.dumps({'status':'PASS','turns':[len(r['turns']) for r in normalized],
                      'exchanges':[sum(len(t['exchanges']) for t in r['turns']) for r in normalized],
                      'rewards':[r['reward']['total'] for r in normalized], 'examples':len(examples), 'new_model_calls':0}))

if __name__ == '__main__':
    main()
