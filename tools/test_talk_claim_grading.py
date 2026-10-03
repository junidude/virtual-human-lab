"""Contextual regressions for recorded TALK gene claims; CPU/stdlib only."""
import hashlib
import json
from pathlib import Path
import unittest

from grade_talk_claims import annotate, score, template_patterns

DATA = Path(__file__).resolve().parents[1] / "research/talk/data"


def evidence(raw=10, detected=3, interval=(4., 5.)):
    return {"raw_count": raw, "detected_cells": detected, "total_cells": 8,
            "rank_pct": sum(interval)/2, "rank_interval": list(interval) if raw else None,
            "log2cpm": 8.641}


class ClaimTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patterns = template_patterns()

    def parse(self, text, facts=None, n=8):
        genes = facts or {"HLA-B": evidence(), "GSK3B": evidence(0, 0), "UTP11": evidence(1, 1)}
        return annotate(text, {"cells": list(range(n)), "genes": genes}, set(genes), self.patterns)

    def test_absence_is_not_presence_coloring(self):
        items = self.parse("Checked all 8 cells; none showed GSK3B, UTP11.")
        self.assertEqual([(m['gene'], m['status']) for m in items], [('GSK3B', 'correct'), ('UTP11', 'incorrect')])

    def test_checking_for_is_not_a_claim(self):
        self.assertEqual(self.parse("Checked all 8 cells for expression of HLA-B.")[0]['status'], 'unscored')

    def test_same_gene_can_receive_two_different_grades(self):
        items = self.parse("In the top 3% of the genes detected here: HLA-B. The 3% to 10% range of the genes detected here takes in HLA-B.")
        self.assertEqual([m['status'] for m in items], ['rank_mismatch', 'correct'])

    def test_not_top_three_is_positive_rank_not_absence(self):
        m = self.parse("Detection puts HLA-B inside the top 10% here, but outside the top 3%.")[0]
        self.assertEqual((m['kind'], m['range'], m['status']), ('rank', [3, 10], 'correct'))

    def test_absent_rank_claim_is_red_not_yellow(self):
        self.assertEqual(self.parse("In the top 3% of the genes detected here: GSK3B.")[0]['status'], 'incorrect')

    def test_ties_crossing_boundary_are_not_false_certainty(self):
        claim = {'kind': 'rank', 'range': [10, 25]}
        self.assertEqual(score(claim, evidence(interval=(9.73, 12.24)), 8, 8), ('unscored', 'tie_boundary'))
        self.assertEqual(score(claim, evidence(interval=(11., 12.)), 8, 8)[0], 'correct')
        self.assertEqual(score(claim, evidence(interval=(3., 9.)), 8, 8)[0], 'rank_mismatch')

    def test_band_boundaries(self):
        for pct, correct_band in [(0, [0,3]), (3, [0,3]), (10, [3,10]), (25, [10,25])]:
            for band in ([0,3], [3,10], [10,25]):
                result = score({'kind':'rank','range':band}, evidence(interval=(pct,pct)), 8, 8)[0]
                self.assertEqual(result, 'correct' if band == correct_band else 'rank_mismatch')

    def test_unknown_gene_is_not_assumed_zero(self):
        m = self.parse("In the top 3% of the genes detected here: HLA-APB.")[0]
        self.assertEqual((m['status'],m['reason'],m['evidence']), ('unscored','missing_gene',None))

    def test_generic_and_cell_type_labels_are_ungraded(self):
        items = self.parse("B cells usually have genes like HLA-B. These are possibly CD4 T cells.", {'HLA-B':evidence(),'CD4':evidence()})
        self.assertTrue(all(m['status']=='unscored' for m in items))

    def test_generic_presence_association_is_not_input_evidence(self):
        items=self.parse("But the presence of HLA-B is indicative of T cells. The presence of HLA-B in this cell is measured.")
        self.assertEqual([m['status'] for m in items], ['unscored','correct'])

    def test_typically_low_transcripts_is_not_corpus_enrichment(self):
        m=self.parse("Read the following with care, since only a few transcripts typically show up here: UTP11.")[0]
        self.assertEqual((m['kind'],m['status']),('low_support','correct'))

    def test_numerical_claims_attach_per_gene_and_keep_decimals(self):
        items = self.parse("Measured log2CPM in the cells shown: HLA-B 8.64; UTP11 0.00; GSK3B at the top.")
        self.assertEqual([m['kind'] for m in items], ['log2cpm','log2cpm','context'])
        self.assertEqual([m['status'] for m in items], ['correct','incorrect','unscored'])

    def test_scope_mismatch_carries_forward(self):
        items = self.parse("Considering the 12 cells shown, in the top 3% of the genes detected here: HLA-B. The 3% to 10% range of the genes detected here takes in HLA-B.")
        self.assertTrue(all(m['reason']=='cell_count_mismatch' for m in items))

    def test_low_support_and_prevalence(self):
        cases = [('low_support',evidence(3,1),'correct'), ('low_support',evidence(0,0),'incorrect'),
                 ('low_support',evidence(4,1),'incorrect'), ('majority',evidence(10,5),'correct'),
                 ('majority',evidence(10,4),'incorrect'), ('minority',evidence(10,4),'correct')]
        for kind, fact, expected in cases:
            self.assertEqual(score({'kind':kind},fact,8,8)[0],expected)

    def test_corpus_claim_is_not_graded_from_presence(self):
        m = self.parse("The genes notably elevated here compared to typical cells are HLA-B.")[0]
        self.assertEqual((m['status'],m['reason']),('unscored','corpus_unavailable'))

    def test_utf16_offsets_and_lowercase_symbols(self):
        text = "🧬 In the top 3% of the genes detected here: C1orf56."
        m = self.parse(text, {'C1orf56':evidence(interval=(1,1))})[0]
        encoded=text.encode('utf-16-le')
        self.assertEqual(encoded[2*m['start']:2*m['end']].decode('utf-16-le'),'C1orf56')


class FrozenDemoTests(unittest.TestCase):
    def test_all_annotations_preserve_recorded_words_and_counts(self):
        raw=(DATA/'talk-demo.json').read_bytes()
        demo=json.loads(raw)
        graded=json.loads((DATA/'gene-claims.json').read_text())
        self.assertEqual(hashlib.sha256(raw).hexdigest(),graded['source_sha256'])
        self.assertEqual(set(demo['answers']),set(graded['answers']))
        for key, answer in demo['answers'].items():
            record=graded['answers'][key]
            text=answer['reasoning']
            encoded=text.encode('utf-16-le')
            self.assertEqual(hashlib.sha256(text.encode()).hexdigest(),record['reasoning_sha256'])
            end=0
            for m in record['mentions']:
                self.assertGreaterEqual(m['start'],end)
                self.assertEqual(encoded[2*m['start']:2*m['end']].decode('utf-16-le'),m['gene'])
                if m['status']=='rank_mismatch':
                    self.assertGreater(m['evidence']['raw_count'],0)
                    self.assertEqual(m['kind'],'rank')
                end=m['end']
            self.assertEqual(sum(record['counts'].values()),len(record['mentions']))

    def test_default_answer_actual_counterexamples(self):
        data=json.loads((DATA/'gene-claims.json').read_text())['answers']['SFT:b_ctrl:8']['mentions']
        for gene, kind, status in [('GSK3B','absent','correct'),('UTP11','absent','incorrect'),
                                   ('HLA-B','rank','correct'),('HLA-DRB1','rank','rank_mismatch'),
                                   ('NDUFA4','rank','unscored')]:
            m=next(m for m in data if m['gene']==gene and m['kind']==kind)
            self.assertEqual(m['status'],status)


if __name__ == '__main__':
    unittest.main()
