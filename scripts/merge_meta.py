#!/usr/bin/env python3
"""Merge all enrichment shards (data/parts/p*.jsonl) into data/meta.json
   = {id:[date, desc]}. Safe to run anytime, even while workers are still going."""
import json, os, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
meta = {}
for f in glob.glob(os.path.join(ROOT, "data", "parts", "*.jsonl")):
    for ln in open(f, encoding="utf-8"):
        try:
            d = json.loads(ln)
        except Exception:
            continue
        if d.get("id"):
            meta[d["id"]] = [d.get("date", ""), d.get("desc", "")]
json.dump(meta, open(os.path.join(ROOT, "data", "meta.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
total = json.load(open(os.path.join(ROOT, "data", "videos.json")))["videos"]
print(f"meta.json: {len(meta)}/{len(total)} videos ({100*len(meta)//len(total)}%) "
      f"with date={sum(1 for v in meta.values() if v[0])}")
