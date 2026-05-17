"""Small RAG-only evaluation over the existing data/raw corpus.

Default mode is offline: it audits heading-v2 chunks and runs a lexical
retrieval smoke test without OpenAI or PostgreSQL. Use --live to exercise the
configured pgvector path when DATABASE_URL and OPENAI_API_KEY are available.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.config import settings
from app.services.raw_data_ingestor import RawDataIngestor


REQUIRED_METADATA = {
    "chunk_id",
    "raw_path",
    "curriculum",
    "subject",
    "grade",
    "chapter",
    "lesson",
    "section",
    "heading_path",
    "line_start",
    "line_end",
    "content_kind",
    "chunk_part",
    "chunk_total_parts",
}


@dataclass(frozen=True)
class EvalCase:
    name: str
    query: str
    subject: str
    grade: str
    expected_raw_paths: tuple[str, ...]


CASES = [
    EvalCase("don-thuc", "Đơn thức và đơn thức thu gọn", "Toán", "8", (
        "ket-noi-tri-thuc-voi-cuoc-song/lop-8/toan/tap-1-chuong-1.md",
        "chan-troi-sang-tao/lop-8/toan/tap-1-chuong-1.md",
    )),
    EvalCase("hang-dang-thuc", "Hằng đẳng thức bình phương của một tổng", "Toán", "8", (
        "ket-noi-tri-thuc-voi-cuoc-song/lop-8/toan/tap-1-chuong-2.md",
        "chan-troi-sang-tao/lop-8/toan/tap-1-chuong-1.md",
    )),
    EvalCase("thales", "Định lí Thalès trong tam giác", "Toán", "8", (
        "ket-noi-tri-thuc-voi-cuoc-song/lop-8/toan/tap-1-chuong-4.md",
        "chan-troi-sang-tao/lop-8/toan/tap-2-chuong-7.md",
    )),
    EvalCase("ham-so-bac-nhat", "Hàm số bậc nhất và đồ thị", "Toán", "8", (
        "ket-noi-tri-thuc-voi-cuoc-song/lop-8/toan/tap-2-chuong-7.md",
    )),
    EvalCase("phan-ung-hoa-hoc", "Phản ứng hoá học chất tham gia sản phẩm", "Khoa học tự nhiên", "8", (
        "ket-noi-tri-thuc-voi-cuoc-song/lop-8/khoa-hoc-tu-nhien/chuong-1.md",
    )),
    EvalCase("acid", "Acid tính chất hoá học hydrochloric acid", "Khoa học tự nhiên", "8", (
        "ket-noi-tri-thuc-voi-cuoc-song/lop-8/khoa-hoc-tu-nhien/chuong-2.md",
    )),
    EvalCase("archimedes", "Lực đẩy Archimedes độ lớn lực đẩy", "Khoa học tự nhiên", "8", (
        "ket-noi-tri-thuc-voi-cuoc-song/lop-8/khoa-hoc-tu-nhien/chuong-3.md",
    )),
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate RAG chunking and retrieval quality.")
    parser.add_argument("--live", action="store_true", help="Run pgvector/OpenAI retrieval if configured.")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when core metrics miss thresholds.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    report = asyncio.run(evaluate(live=args.live))
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        _print_report(report)

    if args.strict:
        failed = (
            report["chunk_audit"]["metadata_coverage"] < 0.95
            or report["offline_retrieval"]["recall_at_5"] < 0.85
            or report["offline_retrieval"]["mrr"] < 0.70
            or report["offline_retrieval"]["citation_alias_valid"] is not True
        )
        if failed:
            sys.exit(1)


async def evaluate(live: bool = False) -> dict[str, Any]:
    ingestor = RawDataIngestor()
    raw_dir = ingestor.resolve_raw_dir()
    chunks = _load_offline_chunks(ingestor, raw_dir)
    report: dict[str, Any] = {
        "raw_dir": str(raw_dir),
        "case_count": len(CASES),
        "chunk_audit": _audit_chunks(chunks),
        "offline_retrieval": _evaluate_offline_retrieval(chunks),
    }
    if live:
        report["live_retrieval"] = await _evaluate_live_retrieval()
    return report


def _load_offline_chunks(ingestor: RawDataIngestor, raw_dir: Path) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for path in sorted(raw_dir.rglob("*.md")):
        resource = ingestor._build_resource(path, raw_dir)
        for chunk in ingestor._chunk_markdown(resource.content_text, resource):
            chunks.append({
                **chunk,
                "source": resource.filename,
                "score": 0.0,
                "type": "offline_raw",
                "resource_id": resource.id,
            })
    return chunks


def _audit_chunks(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    if not chunks:
        return {"chunk_count": 0, "metadata_coverage": 0.0, "duplicate_rate": 0.0}

    complete = 0
    fingerprints: set[str] = set()
    duplicate_count = 0
    content_kinds: dict[str, int] = {}
    for chunk in chunks:
        metadata = chunk.get("metadata") or {}
        if REQUIRED_METADATA <= set(metadata):
            complete += 1
        fingerprint = " ".join(str(chunk.get("text", "")).lower().split())[:500]
        if fingerprint in fingerprints:
            duplicate_count += 1
        fingerprints.add(fingerprint)
        kind = str(metadata.get("content_kind") or "unknown")
        content_kinds[kind] = content_kinds.get(kind, 0) + 1

    return {
        "chunk_count": len(chunks),
        "metadata_coverage": round(complete / len(chunks), 4),
        "duplicate_rate": round(duplicate_count / len(chunks), 4),
        "content_kinds": dict(sorted(content_kinds.items())),
    }


def _evaluate_offline_retrieval(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    case_reports = []
    reciprocal_ranks = []
    hits = 0

    for case in CASES:
        ranked = _offline_search(chunks, case)
        top_five = ranked[:5]
        rank = _first_expected_rank(ranked, case.expected_raw_paths)
        if rank and rank <= 5:
            hits += 1
        reciprocal_ranks.append(1 / rank if rank else 0)
        case_reports.append({
            "name": case.name,
            "expected_raw_paths": list(case.expected_raw_paths),
            "top_raw_path": (top_five[0].get("metadata") or {}).get("raw_path") if top_five else "",
            "rank": rank,
            "hit_at_5": bool(rank and rank <= 5),
            "top_scores": [round(float(chunk.get("score", 0)), 4) for chunk in top_five],
        })

    aliased = _assign_aliases_for_eval([chunk for case in CASES for chunk in _offline_search(chunks, case)[:5]])
    return {
        "recall_at_5": round(hits / len(CASES), 4),
        "mrr": round(sum(reciprocal_ranks) / len(reciprocal_ranks), 4),
        "citation_alias_valid": _citation_aliases_valid(aliased),
        "cases": case_reports,
    }


def _offline_search(chunks: list[dict[str, Any]], case: EvalCase) -> list[dict[str, Any]]:
    query_tokens = _tokens(case.query)
    results = []
    for chunk in chunks:
        metadata = chunk.get("metadata") or {}
        if metadata.get("subject") != case.subject or str(metadata.get("grade")) != case.grade:
            continue
        searchable = " ".join([
            str(chunk.get("text", "")),
            str(metadata.get("chapter", "")),
            str(metadata.get("lesson", "")),
            str(metadata.get("section", "")),
            " ".join(metadata.get("heading_path", []) if isinstance(metadata.get("heading_path"), list) else []),
        ])
        text_tokens = _tokens(searchable)
        lexical = len(query_tokens & text_tokens) / max(1, len(query_tokens))
        heading = len(query_tokens & _tokens(" ".join([
            str(metadata.get("lesson", "")),
            str(metadata.get("section", "")),
        ]))) / max(1, len(query_tokens))
        score = (0.75 * lexical) + (0.25 * heading)
        results.append({**chunk, "score": score})
    results.sort(key=lambda item: item["score"], reverse=True)
    return results


async def _evaluate_live_retrieval() -> dict[str, Any]:
    if not settings.DATABASE_URL or not settings.OPENAI_API_KEY:
        return {"skipped": True, "reason": "DATABASE_URL and OPENAI_API_KEY are required for --live."}

    from app.graph.nodes import rag
    from app.services.vector_store import vector_store

    case_reports = []
    hits = 0
    reciprocal_ranks = []
    for case in CASES:
        results = await rag._search_raw_context(vector_store, case.query, case.subject, case.grade)
        ranked = rag._rerank_and_select(results, {
            "subject": case.subject,
            "grade": case.grade,
            "topic": case.query,
            "objectives": [],
            "emphasis": "",
        })
        rank = _first_expected_rank(ranked, case.expected_raw_paths)
        if rank and rank <= 5:
            hits += 1
        reciprocal_ranks.append(1 / rank if rank else 0)
        case_reports.append({"name": case.name, "rank": rank, "hit_at_5": bool(rank and rank <= 5)})

    return {
        "skipped": False,
        "recall_at_5": round(hits / len(CASES), 4),
        "mrr": round(sum(reciprocal_ranks) / len(reciprocal_ranks), 4),
        "cases": case_reports,
    }


def _assign_aliases_for_eval(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    aliases: dict[str, str] = {}
    assigned = []
    for chunk in chunks:
        metadata = chunk.get("metadata") or {}
        key = str(metadata.get("raw_path") or chunk.get("resource_id") or chunk.get("source") or "")
        if key not in aliases:
            aliases[key] = f"S{len(aliases) + 1}"
        alias = aliases[key]
        assigned.append({**chunk, "source_alias": alias, "metadata": {**metadata, "source_alias": alias}})
    return assigned


def _first_expected_rank(chunks: list[dict[str, Any]], expected_raw_paths: tuple[str, ...]) -> int | None:
    expected = set(expected_raw_paths)
    return next(
        (index + 1 for index, chunk in enumerate(chunks) if (chunk.get("metadata") or {}).get("raw_path") in expected),
        None,
    )


def _citation_aliases_valid(chunks: list[dict[str, Any]]) -> bool:
    aliases = [chunk.get("source_alias") for chunk in chunks]
    return bool(aliases) and all(isinstance(alias, str) and re.fullmatch(r"S\d+", alias) for alias in aliases)


def _tokens(text: str) -> set[str]:
    normalized = unicodedata.normalize("NFD", str(text).casefold()).replace("đ", "d")
    ascii_text = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return {token for token in re.findall(r"[a-z0-9]+", ascii_text) if len(token) > 1}


def _print_report(report: dict[str, Any]) -> None:
    audit = report["chunk_audit"]
    offline = report["offline_retrieval"]
    print(f"Raw dir: {report['raw_dir']}")
    print(f"Chunks: {audit['chunk_count']} | metadata coverage: {audit['metadata_coverage']:.2%} | duplicate rate: {audit['duplicate_rate']:.2%}")
    print(f"Offline recall@5: {offline['recall_at_5']:.2%} | MRR: {offline['mrr']:.3f} | aliases valid: {offline['citation_alias_valid']}")
    for case in offline["cases"]:
        print(f"- {case['name']}: rank={case['rank']} hit@5={case['hit_at_5']} top={case['top_raw_path']}")
    if "live_retrieval" in report:
        print(f"Live retrieval: {report['live_retrieval']}")


if __name__ == "__main__":
    main()
