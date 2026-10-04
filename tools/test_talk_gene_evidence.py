"""Numerical and provenance checks; no model or GPU dependencies."""

import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from make_talk_gene_evidence import (
    block_stats,
    corpus_evidence,
    export_group,
    mentioned_symbols,
    symbol_index,
    validate_legacy_detection,
    verify_sources,
)


class CorpusEvidenceTests(unittest.TestCase):
    def setUp(self):
        # Deliberately shuffle both table rows and fixture columns; baseline
        # storage order must come exclusively from model_gene_index.
        self.mapping = {"gene_id": ["b", "a", "d", "c"],
                        "symbol": ["B", "A", "", "C"],
                        "model_gene_index": [1, 0, 3, 2]}
        self.baseline = np.array([10, 8, 8, 0], dtype=np.float32)

    def test_shuffled_mapping_and_complete_ties(self):
        evidence = corpus_evidence(["c", "a", "missing", "b", "d"], self.baseline, self.mapping)
        self.assertEqual(evidence[0]["corpus_mean_log2cpm"], 8)
        self.assertEqual(evidence[1]["corpus_mean_log2cpm"], 10)
        self.assertNotIn(2, evidence)
        np.testing.assert_allclose(evidence[0]["corpus_rank_interval"], [100 / 3, 200 / 3])
        self.assertEqual(evidence[0]["corpus_rank_interval"], evidence[3]["corpus_rank_interval"])
        # The unnamed zero counts toward the population, but its rank is not
        # a named gene claim. An actual mapped baseline zero remains zero.
        self.assertIsNone(evidence[4]["corpus_rank_interval"])
        self.assertEqual(evidence[4]["corpus_mean_log2cpm"], 0)

    def test_profile_delta_keeps_float32_log_units(self):
        counts = sp.csr_matrix([[30, 1000, 0]])
        evidence = corpus_evidence(["a", "b", "absent"], self.baseline, self.mapping)
        group = export_group(counts, [0], {"A": 0, "B": 1, "X": 2}, ["A", "B", "X"], evidence)
        profile = np.float32(np.log2(1 + 30 / 1030 * 1e6))
        self.assertEqual(group["genes"]["A"]["log2cpm"], float(profile))
        self.assertEqual(group["genes"]["A"]["corpus_delta"], float(profile - np.float32(10)))
        self.assertIsNone(group["genes"]["X"]["corpus_mean_log2cpm"])
        self.assertIsNone(group["genes"]["X"]["corpus_delta"])

    def test_group_ordinal_tie_and_zero(self):
        group = export_group(sp.csr_matrix([[5, 5, 1, 0]]), [0],
                             {f"G{i}": i for i in range(4)}, [f"G{i}" for i in range(4)])
        self.assertEqual(group["genes"]["G0"]["group_rank_interval_ordinal"], [1, 2])
        self.assertEqual(group["genes"]["G1"]["group_rank_interval_ordinal"], [1, 2])
        self.assertEqual(group["genes"]["G2"]["group_rank_interval_ordinal"], [3, 3])
        self.assertIsNone(group["genes"]["G3"]["group_rank_interval_ordinal"])

    def test_dimension_and_bad_values_fail(self):
        for baseline in (np.zeros((2, 2)), np.array([]), np.array([1, 2, 3]),
                         np.array([1, 2, 3, np.nan]), np.array([1, 2, 3, -1]),
                         np.array([1, 2, 3, 25])):
            with self.subTest(baseline=baseline), self.assertRaises(ValueError):
                corpus_evidence(["a"], baseline, self.mapping)

    def test_duplicate_ids_fail(self):
        duplicate = {**self.mapping, "gene_id": ["a", "a", "c", "d"]}
        with self.assertRaisesRegex(ValueError, "duplicate gene IDs"):
            corpus_evidence(["a"], self.baseline, duplicate)
        with self.assertRaisesRegex(ValueError, "Duplicate fixture gene IDs"):
            corpus_evidence(["a", "a"], self.baseline, self.mapping)

    def test_bad_mapping_indices_fail(self):
        for indices in ([0, 1, 2, 4], [0, 1, 2, -1], [0, 1, 2, 2], [0, 1, 2, 1.5], [0, 1, 2, True]):
            with self.subTest(indices=indices), self.assertRaises(ValueError):
                corpus_evidence(["a"], self.baseline, {**self.mapping, "model_gene_index": indices})

    def test_house_requires_measured_high_corpus_expression(self):
        mapping = {"gene_id": ["a", "b", "c"], "symbol": ["RPLP1", "HLA-B", "RPS6KA1"], "model_gene_index": [0, 1, 2]}
        evidence = corpus_evidence(["a", "b", "c"], np.array([5, 4, 3]), mapping)
        self.assertTrue(evidence[0]["corpus_high_house"])
        self.assertFalse(evidence[1]["corpus_high_house"])
        self.assertFalse(evidence[2]["corpus_high_house"])


class BlockEvidenceTests(unittest.TestCase):
    def test_pool_raw_umi_before_normalizing(self):
        counts = sp.csr_matrix([[1, 9, 0], [8, 0, 2]])
        actual = block_stats(counts, [0, 1])
        np.testing.assert_array_equal(actual["total"], [9, 9, 2])
        np.testing.assert_array_equal(actual["detected"], [2, 1, 1])
        np.testing.assert_array_equal(actual["profile"], np.log2(1 + np.array([9, 9, 2]) / 20 * 1e6).astype(np.float32))

    def test_detected_only_rank_and_ties(self):
        # Zeros do not enlarge the rank denominator. Equal values share an
        # interval even though the legacy stable rank point differs.
        counts = sp.csr_matrix([[100, 20, 20, 0, 1, 0]])
        actual = block_stats(counts, [0])
        np.testing.assert_array_equal(actual["percentile"], np.array([1, 2 / 3, 1 / 3, -1, 0, -1], np.float32))
        self.assertEqual(actual["percentile_high"][1], actual["percentile_high"][2])
        self.assertEqual(actual["percentile_low"][1], actual["percentile_low"][2])
        self.assertAlmostEqual(float(actual["percentile_high"][1]), 2 / 3)
        self.assertAlmostEqual(float(actual["percentile_low"][1]), 1 / 3)

    def test_unmapped_gene_still_in_denominator_and_library(self):
        counts = sp.csr_matrix([[100, 50, 25, 0]])
        group = export_group(counts, [0], {"GENE1": 0, "GENE2": 2, "ZERO": 3}, ["GENE1", "GENE2", "ZERO", "MISSING"])
        self.assertEqual(group["detected_gene_count"], 3)
        self.assertEqual(group["raw_total_count"], 175)
        self.assertEqual(group["genes"]["GENE2"]["rank_pct"], 100)
        self.assertEqual(group["genes"]["ZERO"]["raw_count"], 0)
        self.assertIsNone(group["genes"]["ZERO"]["rank_pct"])
        self.assertIsNone(group["genes"]["ZERO"]["rank_interval"])
        self.assertNotIn("MISSING", group["genes"])

    def test_empty_and_single_detected_gene(self):
        empty = block_stats(sp.csr_matrix([[0, 0]]), [0])
        np.testing.assert_array_equal(empty["profile"], [0, 0])
        np.testing.assert_array_equal(empty["percentile"], [-1, -1])
        single = block_stats(sp.csr_matrix([[0, 1]]), [0])
        self.assertEqual(single["percentile"][1], 1)
        self.assertEqual(single["percentile_low"][1], 1)
        self.assertEqual(single["percentile_high"][1], 1)

    def test_low_support_is_one_through_three(self):
        group = export_group(sp.csr_matrix([[0, 1, 2, 3, 4]]), [0],
                             {f"G{i}": i for i in range(5)}, [f"G{i}" for i in range(5)])
        self.assertEqual([group["genes"][f"G{i}"]["low_support"] for i in range(5)], [False, True, True, True, False])

    def test_cell_subset_excludes_unselected_cells(self):
        counts = sp.csr_matrix([[0, 1], [10000, 0]])
        group = export_group(counts, [0], {"A": 0, "B": 1}, ["A", "B"])
        self.assertEqual(group["genes"]["A"]["raw_count"], 0)
        self.assertEqual(group["raw_total_count"], 1)

    def test_tie_crosses_rank_boundary(self):
        # Four top genes tie, spanning rank 0..3.03%, crossing the top-3 edge.
        raw = np.concatenate(([100] * 4, np.arange(96, 0, -1)))
        group = export_group(sp.csr_matrix(raw.reshape(1, -1)), [0], {"TIE": 0}, ["TIE"])
        best, worst = group["genes"]["TIE"]["rank_interval"]
        self.assertEqual(best, 0)
        self.assertGreater(worst, 3)


class SymbolAndProvenanceTests(unittest.TestCase):
    def test_dictionary_is_case_sensitive_and_not_uppercase_only(self):
        answer = {"one": {"reasoning": "C1orf21, HLA-DRA, ABC. c1orf21 and XABC are different.", "final": "RNF13"}}
        self.assertEqual(mentioned_symbols(answer, ["C1orf21", "HLA-DRA", "ABC", "RNF13"]), ["ABC", "C1orf21", "HLA-DRA", "RNF13"])

    def test_ambiguous_and_missing_symbol_are_not_zero(self):
        table = {"gene_id": ["a", "b", "c", "d", "e"], "symbol": ["A", "B", "B", "D", "E"]}
        columns, vocabulary = symbol_index(["a", "b", "c", "unknown", "e"], table)
        self.assertEqual(columns, {"A": 0, "E": 4})
        self.assertEqual(vocabulary, ["A", "B", "D", "E"])

    def test_changed_source_hash_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture"
            path.write_bytes(b"frozen")
            expected = {"fixture": hashlib.sha256(b"frozen").hexdigest()}
            self.assertEqual(verify_sources([path], expected), expected)
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "source hash mismatch"):
                verify_sources([path], expected)

    def test_legacy_detection_disagreement_fails(self):
        demo = {"answers": {"SFT:b_ctrl:8": {"genes": {"MS4A1": 7}}}}
        groups = {"b_ctrl:8": {"genes": {"MS4A1": {"detected_cells": 7}}}}
        self.assertEqual(validate_legacy_detection(demo, groups), 1)
        groups["b_ctrl:8"]["genes"]["MS4A1"]["detected_cells"] = 0
        with self.assertRaisesRegex(ValueError, "Legacy detection mismatch"):
            validate_legacy_detection(demo, groups)


if __name__ == "__main__":
    unittest.main()
