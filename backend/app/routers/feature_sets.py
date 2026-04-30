"""Saved feature bundles — named lists of feature IDs the user pins for reuse."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from ..schemas.saved import FeatureSet, FeatureSetIn, FeatureSetList
from ..services import bq, persistence

log = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=FeatureSet)
def create(
    body: FeatureSetIn,
    x_forwarded_user: str | None = Header(default=None),
) -> FeatureSet:
    persistence.ensure_table("feature_sets")
    fsid = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    user_email = persistence.user_email(x_forwarded_user)
    bq.run_query(
        f"""
        INSERT INTO {bq.app_fq('feature_sets')}
        (feature_set_id, name, description, feature_ids, params_json, user_email, created_at)
        VALUES (@fsid, @name, @desc, @fids, @p, @user, @ts)
        """,
        {
            "fsid": fsid,
            "name": body.name,
            "desc": body.description,
            "fids": json.dumps(body.feature_ids),
            "p": body.params_json,
            "user": user_email,
            "ts": ("TIMESTAMP", created_at),
        },
        cache=False,
    )
    return FeatureSet(
        feature_set_id=fsid,
        name=body.name,
        description=body.description,
        feature_ids=body.feature_ids,
        params_json=body.params_json,
        user_email=user_email,
        created_at=created_at.isoformat().replace("+00:00", "Z"),
    )


@router.get("", response_model=FeatureSetList)
def list_all() -> FeatureSetList:
    persistence.ensure_table("feature_sets")
    df = bq.run_query(
        f"""
        SELECT
          feature_set_id, name, description, feature_ids, params_json, user_email,
          FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', created_at, 'UTC') AS created_at
        FROM {bq.app_fq('feature_sets')}
        ORDER BY created_at DESC
        LIMIT 500
        """,
        cache=False,
    )
    df = df.where(df.notna(), None)
    items = []
    for r in df.to_dict(orient="records"):
        try:
            r["feature_ids"] = json.loads(r["feature_ids"]) if r["feature_ids"] else []
        except (TypeError, ValueError):
            r["feature_ids"] = []
        items.append(FeatureSet(**r))
    return FeatureSetList(items=items)


@router.get("/{feature_set_id}", response_model=FeatureSet)
def get_one(feature_set_id: str) -> FeatureSet:
    persistence.ensure_table("feature_sets")
    df = bq.run_query(
        f"""
        SELECT
          feature_set_id, name, description, feature_ids, params_json, user_email,
          FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', created_at, 'UTC') AS created_at
        FROM {bq.app_fq('feature_sets')}
        WHERE feature_set_id = @fsid
        """,
        {"fsid": feature_set_id},
        cache=False,
    )
    if df.empty:
        raise HTTPException(404, "Feature set not found")
    r = df.where(df.notna(), None).iloc[0].to_dict()
    try:
        r["feature_ids"] = json.loads(r["feature_ids"]) if r["feature_ids"] else []
    except (TypeError, ValueError):
        r["feature_ids"] = []
    return FeatureSet(**r)


@router.delete("/{feature_set_id}")
def delete_one(feature_set_id: str) -> dict:
    persistence.ensure_table("feature_sets")
    bq.run_query(
        f"DELETE FROM {bq.app_fq('feature_sets')} WHERE feature_set_id = @fsid",
        {"fsid": feature_set_id},
        cache=False,
    )
    return {"deleted": feature_set_id}
