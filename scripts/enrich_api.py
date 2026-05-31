#!/usr/bin/env python3
"""FAST enrichment via YouTube Data API v3 (optional, needs an API key).

Gets upload date + full description for ALL videos in ~158 requests (vs hours with yt-dlp).
  export YT_API_KEY=your_key
  python3 scripts/enrich_api.py
Writes data/parts/api.jsonl which merge_meta.py picks up. Cost ~158 units (quota 10k/day).
"""
import json, os, sys, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = os.environ.get("YT_API_KEY")
if not KEY:
    sys.exit("set YT_API_KEY env var first")
UPLOADS = {"main": "UUIwspRtKNszHhIhl36gREjQ", "lives": "UU5aVIcrd8YUcjlFeRMmJMsA"}
out = open(os.path.join(ROOT, "data", "parts", "api.jsonl"), "w", encoding="utf-8")
n = 0
for pl in UPLOADS.values():
    page = ""
    while True:
        q = urllib.parse.urlencode({"part": "snippet,contentDetails", "maxResults": 50,
                                    "playlistId": pl, "pageToken": page, "key": KEY})
        data = json.load(urllib.request.urlopen("https://www.googleapis.com/youtube/v3/playlistItems?" + q))
        for it in data.get("items", []):
            s = it["snippet"]
            vid = it["contentDetails"]["videoId"]
            date = (it["contentDetails"].get("videoPublishedAt") or s.get("publishedAt") or "")[:10].replace("-", "")
            out.write(json.dumps({"id": vid, "date": date, "desc": (s.get("description") or "")[:1500]}, ensure_ascii=False) + "\n")
            n += 1
        page = data.get("nextPageToken")
        if not page:
            break
    print(f"{pl}: total {n}")
out.close()
print(f"wrote {n} -> data/parts/api.jsonl  (run merge_meta.py next)")
