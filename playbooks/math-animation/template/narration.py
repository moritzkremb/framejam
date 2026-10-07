"""Pace scenes to the narration.

Each scene's spoken lines live in script.json. Inside construct():

    with self.line("hook") as d:      # d = this line's length in seconds
        self.play(Write(eq), run_time=d * 0.6)

When the block ends, the scene waits until the line (plus a short gap) is over, so animation and voice stay
together. Line lengths come from audio/durations.json (written by scripts/tts.py); before any audio exists
they are estimated from the word count, so you can animate first and record later.

Every line's start time is written to build/cues/<Scene>.json; scripts/render_all.py uses it to place the audio.
"""
import json
from contextlib import contextmanager
from pathlib import Path

from manim import Scene, config

ROOT = Path(__file__).resolve().parent
GAP = 0.35          # silence after each line
WORDS_PER_SEC = 2.5  # estimate before audio exists (~150 wpm)


def _script():
    return json.loads((ROOT / "script.json").read_text())


def _durations():
    p = ROOT / "audio" / "durations.json"
    return json.loads(p.read_text()) if p.exists() else {}


def line_text(scene, line_id):
    for sc in _script()["scenes"]:
        if sc["id"] == scene:
            for ln in sc["lines"]:
                if ln["id"] == line_id:
                    return ln["text"]
    raise KeyError(f"{scene}/{line_id} is not in script.json")


def line_duration(scene, line_id):
    d = _durations().get(f"{scene}/{line_id}")
    if d:
        return float(d)
    return round(len(line_text(scene, line_id).split()) / WORDS_PER_SEC + 0.3, 2)


class NarratedScene(Scene):
    lead_in = 0.4   # seconds of picture before the first line
    tail = 0.6      # seconds after the last line before the scene cuts

    def setup(self):
        super().setup()
        self._cues = []
        self._started = False

    @contextmanager
    def line(self, line_id, gap=GAP):
        if not self._started:
            self._started = True
            if self.lead_in:
                self.wait(self.lead_in)
        name = type(self).__name__
        d = line_duration(name, line_id)
        t0 = self.time
        self._cues.append({"line": line_id, "t": round(t0, 3), "dur": d})
        yield d
        left = t0 + d + gap - self.time
        if left > 1 / config.frame_rate:
            self.wait(left)

    def tear_down(self):
        if self.tail:
            self.wait(self.tail)
        out = ROOT / "build" / "cues"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{type(self).__name__}.json").write_text(json.dumps(
            {"scene": type(self).__name__, "cues": self._cues, "end": round(self.time, 3)}, indent=1))
        super().tear_down()
