#!/usr/bin/env python3
"""Generate the cast sheet and one still per shot with an image model that takes reference images.

    python3 gen_stills.py                 # everything still missing, the sheet first
    python3 gen_stills.py 03_books 07_dad # just these (delete the old PNG to re-roll)

Reads stills.json in the project folder:
    {
      "style": "STYLE: ... the locked style block, pasted into every prompt ...",
      "cast": {"juni": "JUNI: ...", "chatty": "CHATTY: ..."},
      "sheet": "00_sheet",
      "shots": [
        {"id": "00_sheet", "cast": ["juni", "chatty"], "prompt": "Character model sheet ..."},
        {"id": "01_hi", "cast": ["juni"], "prompt": "Medium close-up of JUNI ...", "size": "1536x1024"}
      ]
    }
Every shot with cast gets the sheet as its reference image (or its own "refs"), so the characters stay on model.
Writes assets/img/<id>.png. Needs OPENAI_API_KEY in the environment (gpt-image-2); about $0.04-0.25 per image.
"""
import base64, json, os, pathlib, sys, time, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path.cwd()
OUT = ROOT / "assets/img"
MODEL = os.environ.get("IMAGE_MODEL", "gpt-image-2")


def call(prompt, size, refs, key):
    if not refs:
        body = json.dumps({"model": MODEL, "prompt": prompt, "size": size, "quality": "high", "n": 1}).encode()
        req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body,
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    else:
        b = uuid.uuid4().hex
        parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
                 for k, v in (("model", MODEL), ("prompt", prompt), ("size", size), ("quality", "high"), ("n", "1"))]
        for r in refs:
            data = (OUT / f"{r}.png").read_bytes()
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="image[]"; filename="{r}.png"\r\n'
                         f'Content-Type: image/png\r\n\r\n'.encode() + data + b"\r\n")
        parts.append(f"--{b}--\r\n".encode())
        req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=b"".join(parts),
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={b}"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return base64.b64decode(json.loads(r.read())["data"][0]["b64_json"])


def main():
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("Set OPENAI_API_KEY (never paste it into a chat or a file in the project).")
    spec = json.loads((ROOT / "stills.json").read_text())
    style, cast, sheet = spec["style"], spec.get("cast", {}), spec.get("sheet")
    OUT.mkdir(parents=True, exist_ok=True)

    def run(shot):
        sid = shot["id"]
        dst = OUT / f"{sid}.png"
        if dst.exists():
            return f"skip {sid}"
        who = [cast[c] for c in shot.get("cast", []) if c in cast]
        prompt = f"{style}\n\n" + ("\n".join(who) + "\n\n" if who else "") + "SCENE: " + shot["prompt"]
        refs = shot.get("refs", [sheet] if who and sheet and sid != sheet else [])
        for _ in range(3):
            try:
                t = time.time()
                dst.write_bytes(call(prompt, shot.get("size", "1536x1024"), refs, key))
                return f"ok {sid} {time.time() - t:.0f}s"
            except Exception as e:
                print(f"retry {sid}: {e} {getattr(e, 'read', lambda: b'')()[:300]}", flush=True)
                time.sleep(5)
        return f"FAIL {sid}"

    want = set(sys.argv[1:])
    shots = [s for s in spec["shots"] if not want or s["id"] in want]
    if sheet and any(s["id"] == sheet for s in shots):
        print(run(next(s for s in shots if s["id"] == sheet)), flush=True)
        shots = [s for s in shots if s["id"] != sheet]
    with ThreadPoolExecutor(6) as ex:
        for msg in ex.map(run, shots):
            print(msg, flush=True)


if __name__ == "__main__":
    main()
