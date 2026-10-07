"""Style-frame stills -> engine clips with a hand-drawn line boil (characters as animated cut-outs).

  .venv/bin/python tools/prep_stills.py [name ...]     # default: every assets/gen/*.jpg

Each still becomes assets/video/<name>/ with BOIL frames at 8 fps (frame 1 = the untouched still, the others carry a
1-2 px smooth displacement), one Apple Vision matte warped with the same field, and a matte-derived track.json.
Scenes loop the boil with `await v.frame(K.boil(t))` (engine/lib.js), so a still never reads as a dead frame.
Needs tools/matte (Apple Vision). Check the mattes over magenta afterwards (references/pipeline.md).
"""
import json
import pathlib
import subprocess
import sys
import zlib

import cv2
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN, VID = ROOT / "assets" / "gen", ROOT / "assets" / "video"
W, H, BOIL, AMP, CELL = 1920, 1080, 3, 1.7, 70


def field(seed):
    r = np.random.default_rng(seed)
    g = r.standard_normal((H // CELL + 2, W // CELL + 2, 2)).astype(np.float32)
    g = cv2.resize(g, (W, H), interpolation=cv2.INTER_CUBIC)
    return g / max(1e-6, np.abs(g).max()) * AMP


def track_from(m):
    s = cv2.resize(m, (W // 4, H // 4)) > 127
    ys, xs = np.nonzero(s)
    if not len(xs):
        return {"pose": None}
    w4, h4 = s.shape[1], s.shape[0]
    k = ys.argmin()
    return {"pose": None,
            "box": [round(xs.min() / w4, 4), round(ys.min() / h4, 4), round(xs.max() / w4, 4), round(ys.max() / h4, 4)],
            "c": [round(xs.mean() / w4, 4), round(ys.mean() / h4, 4)], "a": round(len(xs) / s.size, 4),
            "top": [round(xs[k] / w4, 4), round(ys[k] / h4, 4)]}


def prep(name):
    src = GEN / f"{name}.jpg"
    out = VID / name
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("[fm]_*"):
        f.unlink()
    im = cv2.resize(cv2.imread(str(src)), (W, H), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(str(out / "f_00001.jpg"), im, [cv2.IMWRITE_JPEG_QUALITY, 95])
    subprocess.run([str(ROOT / "tools" / "matte"), str(out)], check=True, capture_output=True)
    m0 = cv2.imread(str(out / "m_00001.png"), cv2.IMREAD_GRAYSCALE)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for i in range(2, BOIL + 1):
        d = field(zlib.crc32(name.encode()) % 10000 + i)
        mx, my = xx + d[..., 0], yy + d[..., 1]
        cv2.imwrite(str(out / f"f_{i:05d}.jpg"), cv2.remap(im, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT),
                    [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(str(out / f"m_{i:05d}.png"), cv2.remap(m0, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
    tr = [track_from(cv2.imread(str(out / f"m_{i:05d}.png"), cv2.IMREAD_GRAYSCALE)) for i in range(1, BOIL + 1)]
    (out / "track.json").write_text(json.dumps(tr))
    meta = {"fps": 8, "n": BOIL, "w": W, "h": H, "dur": BOIL / 8, "ext": "jpg", "lumLo": 0, "lumHi": 1,
            "mask": True, "track": True, "still": True}
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    print(name, "box", tr[0].get("box"), "area", tr[0].get("a"))


names = sys.argv[1:] or sorted(p.stem for p in GEN.glob("*.jpg"))
for n in names:
    prep(n)
