#!/usr/bin/env python3
"""Intelligent series/theme grouping from titles + chronological order (refined).

The recurring title segment (the game/theme) repeats across videos; episode text is
unique. So each video's group key = its most frequent title-segment in the whole corpus.
This captures game series AND themes (Melhores Clipes, Xracing sustos...). A 2nd pass
attaches leftover videos whose title contains a known multi-word game/theme name.
Descriptions are intentionally ignored: they are boilerplate (sponsor/social links).
Playlists are ignored on purpose. Writes data/groups.json.
"""
import json, os, re, unicodedata
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
vids = json.load(open(os.path.join(ROOT, "data", "videos.json")))["videos"]
byId = {v["id"]: v for v in vids}

STOP = {"gameplay", "live", "ao vivo", "pc", "ps5", "ps4", "ps3", "xbox", "switch",
        "completo", "final", "fim", "parte", "part", "ep", "hd", "oficial", "trailer",
        "alanzoka", "", "no pc", "com os amigos", "com amigos", "with friends", "new map"}
THEME_HINT = ("melhor", "momento", "clipe", "corte", "sustos", "xracing", "react",
              "reagindo", "compila", "vlog", "irl", "resumo", "highlights", "fails")
PREFIX = re.compile(r"^alanzoka\s+(jogando|playing|joga|plays|assistindo|reagindo a|reage a|reagindo|jogano)\s+", re.I)

def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", s).strip()

def strip_marker(s):
    s = re.sub(r"^#\s*\d+\s+", "", s)
    s = re.sub(r"\s*[-–—|]+\s*(?:parte|part|ep|episodio|episode|dia|day|temporada|season)\.?\s*#?\s*\d+\b", " ", s, flags=re.I)
    s = re.sub(r"\s+(?:parte|part|ep|episodio|episode)\.?\s*#?\s*\d+\s*$", " ", s, flags=re.I)
    s = re.sub(r"\s*[-–—|]+\s*#\s*\d+\b", " ", s)
    s = re.sub(r"\s*#\s*\d+\s*$", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def clean_seg(n):
    """Strip trailing endings (/ FINAL, / DLC...) and play qualifiers to merge variants."""
    for _ in range(2):
        n = re.sub(r"\s*[/|]\s*(final|fim|the end|completo|conclusao|dlc|parte final|gameplay)\s*$", "", n)
        n = re.sub(r"\s+(no pc|com os amigos|com amigos|com amigo|with friends|with friend|new map|gameplay|ao vivo|completo|remastered|definitive edition)$", "", n)
        n = re.sub(r"[\s:\-/|]+$", "", n)
    return n.strip()

def segments(title):
    t = PREFIX.sub("", strip_marker(title))
    out = []
    for p in re.split(r"\s+[-–—|]\s+", t):
        raw = p.strip()
        excl = raw[-1:] in "!?"                      # episode titles shout ("...!"); games don't
        orig = raw.strip(" \t!?.\"'-–—|:")
        n = clean_seg(norm(orig))
        if len(n) >= 2:
            out.append((n, orig, excl))
    return out

def title_norm(title):
    return clean_seg(norm(PREFIX.sub("", strip_marker(title))))

# pass 1: corpus frequency of cleaned segments
freq = Counter(); seg_cache = {}
for v in vids:
    seg_cache[v["id"]] = segments(v["t"])
    for n in {n for n, _, _ in seg_cache[v["id"]]}:
        freq[n] += 1

# pass 2: per-video key = best non-stop segment: prefer non-exclamatory (game over episode title),
# then most frequent, then longest
members = defaultdict(list); orig_forms = defaultdict(Counter)
for v in vids:
    cands = [(n, o, e) for n, o, e in seg_cache[v["id"]] if n not in STOP and freq[n] >= 2]
    if not cands:
        continue
    key = max(cands, key=lambda c: (not c[2], freq[c[0]], len(c[0])))[0]
    members[key].append(v)
    for n, o, e in seg_cache[v["id"]]:
        if n == key:
            orig_forms[key][o] += 1

groups, vid2g, key2gid = {}, {}, {}
gi = 0
for key, vs in sorted(members.items(), key=lambda kv: -len(kv[1])):
    if len(vs) < 2:
        continue
    gid = "g%d" % gi; gi += 1; key2gid[key] = gid
    groups[gid] = {"title": orig_forms[key].most_common(1)[0][0] or key,
                   "type": "tema" if any(h in key for h in THEME_HINT) else "jogo", "ids": [v["id"] for v in vs]}
    for v in vs:
        vid2g[v["id"]] = gid

# 3rd pass: attach leftovers whose title contains a known multi-word game/theme name
lex = sorted([(k, g) for k, g in key2gid.items() if len(k.split()) >= 2 and len(k) >= 7],
             key=lambda kv: -len(kv[0]))
for v in vids:
    if v["id"] in vid2g:
        continue
    full = title_norm(v["t"])
    for k, gid in lex:
        if re.search(r"\b" + re.escape(k) + r"\b", full):
            groups[gid]["ids"].append(v["id"]); vid2g[v["id"]] = gid; break

# order each group chronologically (oldest first: main before lives, then -o)
for g in groups.values():
    g["ids"].sort(key=lambda i: (0 if byId[i]["c"] == "main" else 1, -byId[i]["o"]))

json.dump({"groups": groups, "vid2g": vid2g}, open(os.path.join(ROOT, "data", "groups.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
grouped = len(vid2g)
print(f"groups: {len(groups)} | grouped videos: {grouped}/{len(vids)} ({100*grouped//len(vids)}%) | avulsos: {len(vids)-grouped}")
for gid, g in list(groups.items())[:15]:
    print(f"  [{g['type']}] {len(g['ids']):4d}  {g['title'][:46]}")
