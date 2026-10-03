"""Numerical and provenance checks; no model or GPU dependencies."""

import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from make_talk_gene_evidence import (
    block_stats,
    export_group,
    mentioned_symbols,
    symbol_index,
    validate_legacy_detection,
    verify_sources,
)


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
