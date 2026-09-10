"""Lightweight lexical retrieval over the organization's knowledge base.

Deliberately dependency-free: a BM25-style score over title/content/tags. The interface
(`search`) is the only thing the agent depends on, so it can be swapped for pgvector or
Amazon Bedrock Knowledge Bases without touching the agent.
"""

import math
import re
from collections import Counter

from sqlalchemy.orm import Session

from app.db.models import KnowledgeItem, Team

_STOP = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "is",
    "are",
    "our",
    "we",
    "have",
    "has",
    "with",
    "that",
    "this",
    "it",
    "be",
    "can",
    "not",
    "at",
    "by",
    "from",
    "as",
    "their",
    "they",
    "you",
}


def tokenize(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in _STOP and len(t) > 1]


def search(db: Session, query: str, limit: int = 4, category: str | None = None) -> list[dict]:
    q = db.query(KnowledgeItem)
    if category:
        q = q.filter(KnowledgeItem.category == category)
    items = q.all()
    if not items:
        return []

    docs = [tokenize(f"{i.title} {i.title} {' '.join(i.tags or [])} {i.content}") for i in items]
    qtokens = tokenize(query)
    if not qtokens:
        return []
    n = len(docs)
    avgdl = sum(len(d) for d in docs) / n
    df = Counter()
    for d in docs:
        df.update(set(d))

    # Weak, single-term overlaps (e.g. only "coordination") are noise: demand at least two distinct
    # matching terms for multi-word queries so the agent does not cite an unrelated policy.
    min_hits = 2 if len(set(qtokens)) >= 3 else 1

    def bm25(doc: list[str]) -> float:
        tf = Counter(doc)
        if len(set(qtokens) & tf.keys()) < min_hits:
            return 0.0
        score = 0.0
        for t in qtokens:
            if t not in tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            k1, b = 1.5, 0.75
            score += idf * (tf[t] * (k1 + 1)) / (tf[t] + k1 * (1 - b + b * len(doc) / avgdl))
        return score

    scored = sorted(
        ((bm25(d), i) for d, i in zip(docs, items, strict=True)), key=lambda x: x[0], reverse=True
    )
    return [
        {"id": i.id, "title": i.title, "category": i.category, "content": i.content, "score": round(s, 3)}
        for s, i in scored[:limit]
        if s > 0
    ]


def directory(db: Session) -> list[dict]:
    return [
        {
            "name": t.name,
            "responsibilities": t.responsibilities,
            "contact": t.contact,
            "categories": t.categories or [],
            "lead": t.lead,
        }
        for t in db.query(Team).order_by(Team.name).all()
    ]
