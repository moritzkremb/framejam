#!/usr/bin/env python3
"""Check an anchor-overlay plan (edit.json) before rendering it.

  python3 scripts/check_plan.py edit.json [captions.json] [--words transcripts/edited.words.json]

Checks (thresholds come from edit.json -> "checks", defaults in anchorlib.py; the user's taste changes them):
  anchor      every overlay leaves A-roll visible on both sides, never more than 2 at once, thumbs stay above the eyes
  overlays    coverage of the runtime, duration of every still and clip, A-roll-only stretches, no repeat in a row
  rhythm      longest gap between any change (captions included), median and longest gap between picture changes
  on the word every overlay, punch, big word and label starts on its spoken word (needs --words)
  captions    chunk length, characters, duration, sentence ends, text equals the transcript, no overlap with big words
  collisions  text against overlays and against other text, the platform-UI zones, the caption width cap
  music       on by default ("music": false turns it off), turnAt inside the reel, levels in range

Prints every failure and warning; exits 1 when something fails. Missing inputs are reported as "not verified".
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import anchorlib as L  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edit", nargs="?", default="edit.json")
    ap.add_argument("captions", nargs="?")
    ap.add_argument("--words", help="edited-time words JSON (enables the on-the-word and transcript checks)")
    ap.add_argument("--allow-placeholders", action="store_true")
    ap.add_argument("--json", action="store_true", help="print the result as JSON")
    a = ap.parse_args()

    plan = L.load_plan(a.edit)
    c, t = plan["checks"], plan["theme"]
    dur = float(plan["duration"])
    fails, warns, notes = [], [], []
    m = L.Measurer(plan)

    cp = Path(a.captions) if a.captions else plan["_root"] / "captions.json"
    caps = L.load_captions(cp) if cp.exists() else None
    if caps is None:
        notes.append("captions: not verified (no captions.json)")
    words = L.load_words(a.words) if a.words else None
    if words is None:
        notes.append("on the word / transcript: not verified (no --words)")

    # ----- structure -----
    ids = set()
    for o in plan["overlays"]:
        oid = o.get("id", "?")
        if o.get("kind", "card") not in L.KINDS:
            fails.append(f"overlay {oid}: kind must be one of {', '.join(L.KINDS)}")
        if oid in ids:
            fails.append(f"overlay {oid}: id used twice")
        ids.add(oid)
        if not (0 <= float(o["at"]) < float(o["end"]) <= dur + 0.01):
            fails.append(f"overlay {oid}: needs 0 <= at < end <= duration ({o['at']}..{o['end']} of {dur})")
        if o.get("placeholder") and not a.allow_placeholders:
            fails.append(f"overlay {oid}: is a placeholder; replace it with a real picture (placeholders are for render.py --quick only)")
        if o.get("kind") == "thumb" and o.get("aside"):
            fails.append(f"overlay {oid}: asides go on cards, not thumbs (use a top-level aside)")
        if o.get("kind") == "thumb" and len(L.srcs(o)) > 2:
            fails.append(f"overlay {oid}: a thumb holds at most 2 pictures")

    # ----- anchor stays visible -----
    rects = {}
    for o in plan["overlays"]:
        oid = o.get("id", "?")
        try:
            rects[oid] = L.overlay_rects(plan, o)
        except SystemExit as e:
            fails.append(str(e))
            continue
        for (x, y, w, h) in rects[oid]:
            left, right = x, L.W - (x + w)
            if left < c["sideMargin"] or right < c["sideMargin"]:
                fails.append(f"A-roll hidden: overlay {oid} leaves {min(left, right)} px at the side (needs {c['sideMargin']})")
            if o.get("kind") != "tall" and y < c["edgeMargin"] and L.H - (y + h) < c["edgeMargin"]:
                fails.append(f"A-roll hidden: overlay {oid} covers both the top and the bottom (needs {c['edgeMargin']} px at one)")
            if o.get("kind") == "thumb" and y + h > plan["aroll"]["eyeY"] - c["eyeClear"]:
                fails.append(f"A-roll hidden: thumb {oid} reaches y {y + h}, eyes are at {plan['aroll']['eyeY']} (keep {c['eyeClear']} px clear)")
    pts = sorted(set([float(o["at"]) for o in plan["overlays"]] + [float(o["end"]) for o in plan["overlays"]]))
    for t0, t1 in zip(pts, pts[1:]):
        mid = (t0 + t1) / 2
        live = [o for o in plan["overlays"] if float(o["at"]) <= mid < float(o["end"])]
        if len(live) > c["maxOverlaysAtOnce"]:
            fails.append(f"A-roll hidden: {len(live)} overlays at once at {mid:.1f} s ({', '.join(o.get('id', '?') for o in live)}; max {c['maxOverlaysAtOnce']})")
            break

    # ----- overlay cadence -----
    spans = sorted((float(o["at"]), float(o["end"])) for o in plan["overlays"])
    union, cur = [], None
    for s, e in spans:
        if cur and s <= cur[1]:
            cur[1] = max(cur[1], e)
        else:
            cur = [s, e]
            union.append(cur)
    coverage = sum(e - s for s, e in union) / dur if dur else 0
    if not c["minCoverage"] <= coverage <= c["maxCoverage"]:
        fails.append(f"overlay cadence: overlays cover {coverage * 100:.0f}% of the runtime (wanted {c['minCoverage'] * 100:.0f}-{c['maxCoverage'] * 100:.0f}%)")
    per_min = len(plan["overlays"]) / dur * 60 if dur else 0
    for o in plan["overlays"]:
        d = float(o["end"]) - float(o["at"])
        video = L.is_video(L.srcs(o)[0])
        lo, hi = (c["stillMin"], c["clipMax"]) if video else (c["stillMin"], c["stillMax"])
        if not lo - 1e-6 <= d <= hi + 1e-6:
            fails.append(f"overlay cadence: {o.get('id', '?')} lasts {d:.2f} s ({'clip' if video else 'still'}: wanted {lo}-{hi} s)")
    for p, q in zip(plan["overlays"], plan["overlays"][1:]):
        if L.srcs(p) == L.srcs(q):
            fails.append(f"overlay cadence: {p.get('id', '?')} and {q.get('id', '?')} show the same picture in a row")
    breakpoints = [(float(p["at"]), float(p["at"])) for p in plan["punches"] if float(p["at"]) > 0.05] + [(float(b["at"]), float(b["end"])) for b in plan["big"]]
    edges = [(0.0, 0.0)] + spans + [(dur, dur)]
    free = []
    last_end = 0.0
    for s, e in sorted(spans):
        if s > last_end:
            free.append((last_end, s))
        last_end = max(last_end, e)
    if dur > last_end:
        free.append((last_end, dur))
    for fs, fe in free:
        marks = sorted([fs, fe] + [x for p in breakpoints for x in p if fs < x < fe])
        for x, y in zip(marks, marks[1:]):
            if y - x > c["maxArollOnly"] + 1e-6:
                fails.append(f"overlay cadence: {x:.1f}-{y:.1f} s is {y - x:.1f} s of A-roll alone (max {c['maxArollOnly']} s without a punch-in or a big word)")

    # ----- rhythm -----
    pe = L.picture_events(plan)
    pgaps = L.gaps([t0 for t0, _, _ in pe], dur)
    cap_times = []
    for cc in caps or []:
        cap_times += [cc["start"], cc["end"]]
    allg = L.gaps([t0 for t0, _, _ in pe] + cap_times, dur)
    if caps is not None and max(allg) > c["maxGap"] + 1e-6:
        fails.append(f"rhythm: longest gap between any two changes is {max(allg):.2f} s (max {c['maxGap']} s)")
    med = L.median(pgaps)
    if not c["pictureMedianMin"] <= med <= c["pictureMedianMax"]:
        fails.append(f"rhythm: median gap between picture changes is {med:.2f} s (wanted {c['pictureMedianMin']}-{c['pictureMedianMax']} s)")
    if max(pgaps) > c["maxPictureGap"] + 1e-6:
        fails.append(f"rhythm: longest gap between picture changes is {max(pgaps):.2f} s (max {c['maxPictureGap']} s)")
    hard = [p for p in plan["punches"] if float(p["zoom"]) >= c["hardZoom"]]
    if dur and len(hard) / dur * 60 > c["maxPunchPerMinuteHard"] + 0.5:
        warns.append(f"rhythm: {len(hard)} hard punch-ins in {dur:.0f} s (about {c['maxPunchPerMinuteHard']} a minute reads best)")
    for p, q in zip(plan["punches"], plan["punches"][1:]):
        if abs(float(p["zoom"]) - float(q["zoom"])) < 0.02:
            warns.append(f"rhythm: punches at {p['at']} s and {q['at']} s share a framing; consecutive stretches should alternate")
    for p in plan["punches"]:
        if float(p["zoom"]) > 1.5:
            fails.append(f"punch at {p['at']} s zooms {p['zoom']}x: the face may leave the frame (keep it to 1.5x or less)")

    # ----- on the word -----
    if words:
        def on_word(t0, what):
            if not any(-c["onWordEarly"] - 1e-6 <= t0 - w["start"] <= c["onWordLate"] + 1e-6 for w in words):
                nearest = min(words, key=lambda w: abs(w["start"] - t0))
                fails.append(f"on the word: {what} at {t0:.2f} s doesn't start on a word (nearest '{nearest['text']}' starts {nearest['start']:.2f} s)")

        for o in plan["overlays"]:
            at = float(o["at"])
            tgt = L.norm_word(o.get("word", ""))
            if tgt:
                cand = [w for w in words if L.norm_word(w["text"]) == tgt and abs(w["start"] - at) < 2.5]
                if not cand:
                    fails.append(f"on the word: overlay {o.get('id', '?')} says word '{o['word']}' but no such word is spoken within 2.5 s of {at:.2f} s")
                else:
                    w = min(cand, key=lambda w: abs(w["start"] - at))
                    if at < w["start"] - c["onWordEarly"] - 1e-6 or at > w["start"] + c["onWordLate"] + 1e-6:
                        fails.append(f"on the word: overlay {o.get('id', '?')} starts at {at:.2f} s but '{w['text']}' starts at {w['start']:.2f} s (allowed {-c['onWordEarly']:+.2f} to +{c['onWordLate']:.2f} s)")
            else:
                on_word(at, f"overlay {o.get('id', '?')}")
        for p in plan["punches"]:
            if float(p["at"]) > 0.05:
                on_word(float(p["at"]), "punch")
        for b in plan["big"]:
            on_word(float(b["at"]), f"big word '{b['text']}'")
        for l in plan["labels"]:
            on_word(float(l["at"]), f"label '{l['text']}'")

    # ----- captions -----
    max_words = int(t["captionMaxWords"])
    if caps is not None:
        prev = None
        for cc in caps:
            n = len(cc["text"].split())
            txt = L.style_text(t, "caption", cc["text"])
            d = cc["end"] - cc["start"]
            tag = f"caption '{cc['text']}' at {cc['start']:.2f} s"
            if n > max_words:
                fails.append(f"captions: {tag} has {n} words (max {max_words})")
            if len(cc["text"]) > c["captionMaxChars"]:
                fails.append(f"captions: {tag} has {len(cc['text'])} characters (max {c['captionMaxChars']})")
            if d < c["captionMin"] - 1e-6 or d > c["captionMax"] + 1e-6:
                fails.append(f"captions: {tag} lasts {d:.2f} s (wanted {c['captionMin']}-{c['captionMax']} s)")
            if any(w["text"].rstrip().endswith((".", "!", "?")) for w in cc.get("words", [])[:-1]):
                fails.append(f"captions: {tag} runs across a sentence end")
            if prev and cc["start"] < prev["end"] - 1e-6:
                fails.append(f"captions: {tag} overlaps the one before it")
            for b in plan["big"]:
                if cc["start"] < float(b["end"]) and cc["end"] > float(b["at"]):
                    fails.append(f"captions: {tag} runs while the big word '{b['text']}' is up (make_captions.py --hide edit.json)")
            wid = m.width(txt, t["captionFontFile"], t["captionSize"], t["captionStrokeWidth"])
            if wid > t["captionMaxWidth"]:
                fails.append(f"collisions: {tag} is {wid:.0f} px wide (max {t['captionMaxWidth']} px)")
            prev = cc
        if words:
            heard = [L.norm_word(w["text"]) for w in words if L.norm_word(w["text"])]
            shown = []
            for cc in caps:
                for w in cc.get("words", []):
                    shown += [x for x in (L.norm_word(y) for y in str(w.get("orig", w["text"])).split()) if x]
            # words under a big word are hidden on purpose
            hidden = [L.norm_word(w["text"]) for w in words if any(float(b["at"]) <= w["start"] < float(b["end"]) for b in plan["big"])]
            expect = [h for h in heard]
            for hw in hidden:
                if hw in expect:
                    expect.remove(hw)
            if shown != expect:
                i = next((i for i, (p, q) in enumerate(zip(shown, expect)) if p != q), min(len(shown), len(expect)))
                fails.append(f"captions: the text differs from the transcript at word {i + 1} (captions '{shown[i] if i < len(shown) else '<end>'}', transcript '{expect[i] if i < len(expect) else '<end>'}')")

    # ----- collisions -----
    def live(a0, a1):
        return [o for o in plan["overlays"] if float(o["at"]) < a1 and float(o["end"]) > a0]

    boxes = []
    for b in plan["big"]:
        r, size = L.text_rect(plan, m, "big", b["text"], size=t["bigSize"], width_cap=t["bigMaxWidth"])
        if size < t["bigSize"] - 0.5:
            warns.append(f"big word '{b['text']}' is too wide at {t['bigSize']} px and is shrunk to {size:.0f} px")
        boxes.append((f"big word '{b['text']}'", r, float(b["at"]), float(b["end"])))
    for l in plan["labels"]:
        r, _ = L.text_rect(plan, m, "label", l["text"], width_cap=960)
        boxes.append((f"label '{l['text']}'", r, float(l["at"]), float(l["end"])))
    for s in plan["asides"]:
        r, _ = L.text_rect(plan, m, "aside", s["text"])
        boxes.append((f"aside '{s['text']}'", r, float(s["at"]), float(s["end"])))
    for cc in caps or []:
        r, _ = L.text_rect(plan, m, "caption", cc["text"])
        boxes.append((f"caption '{cc['text']}'", r, cc["start"], cc["end"]))
    for name, r, a0, a1 in boxes:
        x, y, w, h = r
        if y < c["uiTop"] or y + h > c["uiBottomY"] or x < c["textMinX"] or x + w > c["textMaxX"]:
            fails.append(f"collisions: {name} at {a0:.2f} s sits in the platform-UI zone (box x {x:.0f}-{x + w:.0f}, y {y:.0f}-{y + h:.0f})")
        elif x + w > c["uiRightX"] and not (y + h < c["uiRightY"][0] or y > c["uiRightY"][1]):
            fails.append(f"collisions: {name} at {a0:.2f} s runs into the right-hand UI strip (x {x + w:.0f} > {c['uiRightX']})")
        if name.startswith("label"):
            continue
        for o in live(a0, a1):
            for orct in rects.get(o.get("id", "?"), []):
                if name.startswith("caption") and o.get("kind") != "thumb":
                    continue
                if L.rects_hit(r, orct, pad=4):
                    fails.append(f"collisions: {name} at {a0:.2f} s overlaps overlay {o.get('id', '?')}")
    for i, (n1, r1, a1s, a1e) in enumerate(boxes):
        for n2, r2, a2s, a2e in boxes[i + 1:]:
            if n1.startswith("caption") and n2.startswith("caption"):
                continue
            if a1s < a2e and a2s < a1e and L.rects_hit(r1, r2, pad=4):
                fails.append(f"collisions: {n1} and {n2} overlap at {max(a1s, a2s):.2f} s")
    for l in plan["labels"]:
        r, _ = L.text_rect(plan, m, "label", l["text"], width_cap=960)
        span = float(l["end"]) - float(l["at"])
        hid = 0.0
        cuts = sorted((float(o["at"]), float(o["end"])) for o in plan["overlays"] if any(L.rects_hit(r, orct, pad=8) for orct in rects.get(o.get("id", "?"), [])))
        shown = span
        for s0, s1 in cuts:
            hid += max(0.0, min(s1, float(l["end"])) - max(s0, float(l["at"])))
        shown = span - hid
        if span and shown / span < 0.4:
            warns.append(f"label '{l['text']}' is hidden under overlays for {hid:.1f} of its {span:.1f} s (the renderer hides labels under pictures)")

    # ----- music -----
    mu = plan.get("music")
    if mu is False:
        notes.append("music: off")
    elif not isinstance(mu, dict) or not mu.get("src"):
        fails.append("music: it's on by default; add a \"music\" object (src, turnAt) or set \"music\": false")
    else:
        turn = mu.get("turnAt")
        if turn is None or not 0.5 < float(turn) < dur - 0.5:
            fails.append(f"music: turnAt {turn} must sit inside the reel (0.5 s to {dur - 0.5:.1f} s)")
        cdb, ddb = float(mu.get("calmDb", -22)), float(mu.get("driveDb", -16))
        if not c["calmDb"][0] <= cdb <= c["calmDb"][1]:
            fails.append(f"music: calmDb {cdb} outside {c['calmDb'][0]}..{c['calmDb'][1]} dB under the voice")
        if not c["driveDb"][0] <= ddb <= c["driveDb"][1]:
            fails.append(f"music: driveDb {ddb} outside {c['driveDb'][0]}..{c['driveDb'][1]} dB under the voice")
        if not (plan["_root"] / mu["src"]).exists():
            warns.append(f"music: {mu['src']} isn't there yet (python3 scripts/make_music.py)")

    shown_caps = len(caps) if caps else 0
    summary = {
        "duration": dur, "overlays": len(plan["overlays"]), "overlaysPerMinute": round(per_min, 1), "coverage": round(coverage, 3),
        "pictureChanges": len(pe), "pictureMedianGap": round(med, 2), "pictureLongestGap": round(max(pgaps), 2),
        "longestGapAny": round(max(allg), 2) if caps is not None else None, "captions": shown_caps,
    }
    if a.json:
        print(json.dumps({"ok": not fails, "summary": summary, "failures": fails, "warnings": warns, "notes": notes}, indent=1))
    else:
        print(f"{dur:.1f} s, {summary['overlays']} overlays ({summary['overlaysPerMinute']}/min) covering {coverage * 100:.0f}%, "
              f"{len(pe)} picture changes: median gap {med:.2f} s, longest {max(pgaps):.2f} s"
              + (f"; {shown_caps} captions, longest gap between any changes {max(allg):.2f} s" if caps is not None else ""))
        for x in notes:
            print("  note:", x)
        for x in warns:
            print("  warning:", x)
        for x in fails:
            print("  FAIL:", x)
        print("plan ok" if not fails else f"plan needs work ({len(fails)} failures)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
