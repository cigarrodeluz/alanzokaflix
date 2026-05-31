#!/usr/bin/env python3
"""Resumable enrichment worker: fetch upload_date + description for a slice of videos.

Usage: enrich_videos.py <total_workers> <index>
Writes one JSON per line to data/parts/p<index>.jsonl  -> {"id","date","desc"}
Re-running skips ids already present (resume). Many workers run in parallel.
"""
import json, os, sys, subprocess, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YTDLP = os.path.join(ROOT, ".venv", "bin", "yt-dlp")
PARTS = os.path.join(ROOT, "data", "parts")
os.makedirs(PARTS, exist_ok=True)

total, index = int(sys.argv[1]), int(sys.argv[2])
vids = json.load(open(os.path.join(ROOT, "data", "videos.json")))["videos"]
mine = [v["id"] for i, v in enumerate(vids) if i % total == index]

part = os.path.join(PARTS, f"p{index}.jsonl")
done = set()
for f in glob.glob(os.path.join(PARTS, "p*.jsonl")):   # global resume across all shards
    for ln in open(f, encoding="utf-8"):
        try: done.add(json.loads(ln)["id"])
        except Exception: pass
todo = [i for i in mine if i not in done]
if not todo:
    sys.exit(0)

batch = os.path.join(PARTS, f"b{index}.txt")
with open(batch, "w") as f:
    f.write("\n".join("https://www.youtube.com/watch?v=" + i for i in todo))

# one yt-dlp process for the whole slice (reuses player cache); stream + append
proc = subprocess.Popen(
    [YTDLP, "--batch-file", batch, "--skip-download", "--no-warnings", "--no-progress",
     "--ignore-errors", "--print", "%(id)s\t%(upload_date)s\t%(description)j"],
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
with open(part, "a", encoding="utf-8") as out:
    for line in proc.stdout:
        p = line.rstrip("\n").split("\t", 2)
        if len(p) < 2 or not p[0]:
            continue
        vid, date = p[0], (p[1] if p[1] != "NA" else "")
        try: desc = json.loads(p[2])[:1500] if len(p) > 2 and p[2] else ""
        except Exception: desc = ""
        out.write(json.dumps({"id": vid, "date": date, "desc": desc}, ensure_ascii=False) + "\n")
        out.flush()
proc.wait()
