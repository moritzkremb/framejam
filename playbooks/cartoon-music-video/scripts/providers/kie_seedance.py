#!/usr/bin/env python3
"""OPTIONAL PROVIDER: Seedance 2.5 image/audio-to-video via kie.ai: submit, poll, download, credits, ledger.
Any other video model works (see references/providers.md); this is one ready-made option.

submit  --prompt P --out NAME [--image F ...] [--audio F ...] [--video F ...] [--first F] [--last F]
        [--duration 8] [--res 720p] [--aspect 16:9] [--no-audio-out] [--last-frame] [--wait]
poll    TASK_ID --out NAME
credits
ledger

PRIVACY: kie only fetches URLs, so local files (style frames, audio slices) are uploaded to litterbox.catbox.moe,
a public anonymous host (1 h expiry; anyone with the link can download them). Pass your own https:// URLs instead
for anything private.
first/last frame and reference_* inputs are mutually exclusive on kie.
"""
import argparse, json, os, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

API = "https://api.kie.ai/api/v1"
MODEL = "bytedance/seedance-2-5"
ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "ledger.jsonl"
USD_PER_SEC = {"480p": 0.14, "720p": 0.315}
FLOOR_CREDITS = int(os.environ.get("KIE_FLOOR", 0))  # refuse to submit when the balance would drop below this (set per budget)


def key():
    k = os.environ.get("KIE_API_KEY")
    if not k:
        for env in (ROOT / ".env", Path.cwd() / ".env"):
            if env.exists():
                for line in env.read_text().splitlines():
                    if line.startswith("KIE_API_KEY="):
                        k = line.split("=", 1)[1].strip().strip('"')
    if not k:
        sys.exit("KIE_API_KEY missing: set it in the environment or the project's .env")
    return k


def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json",
                                          "User-Agent": "webgl-music-video/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            res = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:2000]}")
    if res.get("code") != 200:
        sys.exit(f"kie {res.get('code')}: {res.get('msg')}")
    return res.get("data")


def host(path):
    if str(path).startswith(("https://", "asset://")):
        return str(path)
    r = subprocess.run(["curl", "-sf", "-F", "reqtype=fileupload", "-F", "time=1h", "-F", f"fileToUpload=@{path}",
                        "https://litterbox.catbox.moe/resources/internals/api.php"],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()


def log(entry):
    with LEDGER.open("a") as f:
        f.write(json.dumps({"provider": "kie", **entry}) + "\n")


def submit(a):
    inp = {"prompt": a.prompt, "duration": a.duration, "resolution": a.res, "aspect_ratio": a.aspect,
           "generate_audio": not a.no_audio_out, "return_last_frame": a.last_frame}
    if a.image:
        inp["reference_image_urls"] = [host(p) for p in a.image]
    if a.audio:
        inp["reference_audio_urls"] = [host(p) for p in a.audio]
    if a.video:
        inp["reference_video_urls"] = [host(p) for p in a.video]
    if a.first:
        inp["first_frame_url"] = host(a.first)
    if a.last:
        inp["last_frame_url"] = host(a.last)
    est = round(USD_PER_SEC.get(a.res, 0.315) * a.duration, 2)
    bal = call(f"{API}/chat/credit")
    if bal - est / 0.005 < FLOOR_CREDITS:
        sys.exit(f"BUDGET GUARD: balance {bal} credits, job needs ~{est / 0.005:.0f}, floor {FLOOR_CREDITS}")
    task = call(f"{API}/jobs/createTask", {"model": MODEL, "input": inp})["taskId"]
    log({"t": time.time(), "job": task, "out": a.out, "est_usd": est, "prompt": a.prompt, "input": inp})
    print(json.dumps({"task": task, "est_usd": est}))
    return task


def poll(task, out, every=15, timeout=1800):
    t0 = time.time()
    while time.time() - t0 < timeout:
        d = call(f"{API}/jobs/recordInfo?taskId={task}")
        s = d.get("state")
        if s == "success":
            res = json.loads(d.get("resultJson") or "{}")
            dest = ROOT / "assets" / "clips" / f"{out}.mp4"
            dest.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["curl", "-sfL", "-o", str(dest), res["resultUrls"][0]], check=True)
            for i, u in enumerate(res.get("lastFrameUrl") or []):
                subprocess.run(["curl", "-sfL", "-o", str(dest.with_suffix(f".last{i or ''}.png")), u], check=True)
            log({"t": time.time(), "job": task, "out": out, "status": s, "credits": d.get("creditsConsumed")})
            print(json.dumps({"task": task, "status": s, "credits": d.get("creditsConsumed"), "file": str(dest)}))
            return dest
        if s == "fail":
            log({"t": time.time(), "job": task, "out": out, "status": s, "error": d.get("failMsg")})
            print(json.dumps({"task": task, "status": s, "code": d.get("failCode"), "error": d.get("failMsg")}))
            return None
        time.sleep(every)
    print(json.dumps({"task": task, "status": "timeout"}))


def credits():
    print(json.dumps({"credits": call(f"{API}/chat/credit")}))


def ledger():
    est = 0.0
    for line in LEDGER.read_text().splitlines() if LEDGER.exists() else []:
        est += json.loads(line).get("est_usd") or 0
    print(json.dumps({"estimated_usd_all_providers": round(est, 2)}))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("submit")
    s.add_argument("--prompt", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--image", action="append")
    s.add_argument("--audio", action="append")
    s.add_argument("--video", action="append")
    s.add_argument("--first")
    s.add_argument("--last")
    s.add_argument("--duration", type=int, default=8)
    s.add_argument("--res", default="720p", choices=["480p", "720p", "1080p"])
    s.add_argument("--aspect", default="16:9")
    s.add_argument("--no-audio-out", action="store_true")
    s.add_argument("--last-frame", action="store_true")
    s.add_argument("--wait", action="store_true")
    p = sub.add_parser("poll")
    p.add_argument("task")
    p.add_argument("--out", required=True)
    sub.add_parser("credits")
    sub.add_parser("ledger")
    a = ap.parse_args()
    if a.cmd == "submit":
        task = submit(a)
        if a.wait:
            poll(task, a.out)
    elif a.cmd == "poll":
        poll(a.task, a.out)
    elif a.cmd == "credits":
        credits()
    else:
        ledger()
