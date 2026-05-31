#!/usr/bin/env python3
"""Fetch ALL videos from Alanzoka's two channels via yt-dlp and cache to data/videos.json.

Run:  ./.venv/bin/python scripts/fetch_videos.py
Needs yt-dlp installed (see README). No YouTube API key required.
"""
import json, subprocess, sys, time, os
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YTDLP = os.path.join(ROOT, ".venv", "bin", "yt-dlp")
if not os.path.exists(YTDLP):
    YTDLP = "yt-dlp"  # fall back to PATH

CHANNELS = {
    "main":  {"id": "UCIwspRtKNszHhIhl36gREjQ", "title": "alanzoka",          "handle": "@alanzoka",       "subscribers": "9.12M"},
    "lives": {"id": "UC5aVIcrd8YUcjlFeRMmJMsA", "title": "Lives do alanzoka", "handle": "@livesalanzoka", "subscribers": "3.96M"},
}


def fetch(channel_key, meta):
    uploads = "UU" + meta["id"][2:]  # uploads playlist = channel id with UU prefix
    url = f"https://www.youtube.com/playlist?list={uploads}"
    print(f"[{channel_key}] fetching {url} ...", flush=True)
    proc = subprocess.run(
        [YTDLP, "--flat-playlist", "--ignore-errors", "--no-warnings", "--dump-json", url],
        capture_output=True, text=True,
    )
    videos = []
    for i, line in enumerate(proc.stdout.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        vid = d.get("id")
        if not vid:
            continue
        videos.append({
            "id": vid,
            "t": d.get("title") or "(sem título)",
            "d": int(d.get("duration") or 0),
            "v": int(d.get("view_count") or 0),
            "c": channel_key,
            "o": i,  # order within channel: 0 = newest
        })
    print(f"[{channel_key}] got {len(videos)} videos", flush=True)
    return videos


def main():
    all_videos, channels = [], {}
    for key, meta in CHANNELS.items():
        vids = fetch(key, meta)
        channels[key] = {**meta, "videoCount": len(vids)}
        all_videos.extend(vids)
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "channels": channels,
        "videos": all_videos,
    }
    path = os.path.join(ROOT, "data", "videos.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(path) / 1024
    print(f"wrote {len(all_videos)} videos -> {path} ({size:.0f} KB)")


if __name__ == "__main__":
    main()
