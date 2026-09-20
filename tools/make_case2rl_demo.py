#!/usr/bin/env python3
"""Export only the publishable synthetic fixture and saved checks; no model calls.

Usage: uv run --with pyyaml python tools/make_case2rl_demo.py --source /path/to/case2RL
Source papers, private cases, candidate rollouts and credentials are never read.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import yaml


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(source: Path) -> dict:
    case_path = source / 'cases/examples/synthetic-gpa/case.yaml'
    audit_path = source / 'runs/audit-synthetic-gpa.json'
    case = yaml.safe_load(case_path.read_text())
    audit = json.loads(audit_path.read_text())
    if case['source']['kind'] != 'synthetic' or case['source']['publishable'] is not True:
        raise ValueError('Only the explicitly publishable synthetic fixture is accepted')
    if case['case_id'] != 'synthetic-gpa' or audit['case_id'] != case['case_id']:
        raise ValueError('Unexpected case or mismatched audit')
    facts = [dict(id=fact['id'], category='history', name=f'History {i + 1}', text=fact['text'])
             for i, fact in enumerate(case['history'])]
    facts += [dict(id=fact['id'], category='exam' if fact['category'] == 'exam' else 'tests',
                   name=fact['name'], text=fact['result'],
                   explicit_order_only=fact.get('explicit_order_only', False))
              for fact in case['findings']]
    samples = []
    for sample in audit['samples']:
        matches = [r for r in audit['results'] if r['probe'].split(':', 1)[-1] == sample['request']]
        if len(matches) != 1:
            raise ValueError('Audit sample lacks a unique recorded check')
        record = matches[0]
        category = record['probe'].split(':', 1)[0]
        if category not in ('leak', 'repeat'):
            raise ValueError('Unexpected audit sample category')
        samples.append(dict(category='guard' if category == 'leak' else 'generated',
                            request=sample['request'], response=sample['response'],
                            check=record['probe'], passed=record['passed']))
    results = audit['results']
    return {
        'schema': 'case2rl.public-demo.v1', 'case_id': case['case_id'],
        'source_kind': 'original synthetic teaching case', 'publishable': True,
        'case_status': case['status'], 'presentation': case['presentation'],
        'facts': facts, 'reference_diagnosis': case['diagnosis']['reference'],
        'audit': {
            'total': len(results), 'passed': sum(r['passed'] is True for r in results),
            'core_checks': sum(r['probe'].startswith('core:') for r in results),
            'leak_checks': sum(r['probe'].startswith('leak:') for r in results),
            'repeat_checks': sum(r['probe'].startswith('repeat:') for r in results),
            'samples': samples,
            'scope': 'Recorded synthetic-fixture checks; not a diagnostic benchmark or a candidate rollout',
            'model': None, 'recorded_at': None,
        },
        'provenance': {
            'case_sha256': digest(case_path), 'audit_sha256': digest(audit_path),
            'api_calls_on_this_page': False, 'trained_rl_policy': False,
            'original_text_preserved': True,
            'published_scope': 'Synthetic source facts and whitelisted saved audit request/response samples only',
        },
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] /
                   'research/case2rl/assets/synthetic-demo.json')
    p.add_argument('--check', action='store_true', help='Verify source parity without changing output')
    args = p.parse_args()
    data = build(args.source)
    payload = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if args.output.read_text() != payload:
            raise ValueError('Published demo differs from current synthetic sources')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload)
    print(json.dumps({'status': 'PASS', 'facts': len(data['facts']),
                      'saved_samples': len(data['audit']['samples']), 'new_model_calls': 0}))


if __name__ == '__main__':
    main()
