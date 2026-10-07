# Setup

## Install (free)

Manim Community needs Python 3.10+, ffmpeg, and the Cairo and Pango libraries. Full guide: https://docs.manim.community/en/stable/installation.html

**macOS**
```bash
brew install ffmpeg cairo pango pkg-config
cp -R <playbook>/template ~/videos/<project> && cd ~/videos/<project>
python3 -m venv .venv && source .venv/bin/activate      # or: uv venv && source .venv/bin/activate
pip install -r requirements.txt                         # manim + the free Kokoro voice
manim --version
```

**Linux (Debian/Ubuntu)**
```bash
sudo apt install ffmpeg libcairo2-dev libpango1.0-dev pkg-config python3-dev python3-venv
```
then the same venv and `pip install -r requirements.txt`.

**Windows:** install Python and ffmpeg, then `pip install manim` (wheels include Cairo/Pango). Or use WSL and the Linux steps.

### If `pip install manim` fails building pycairo
- `pkg-config --modversion cairo` must print a version. On macOS with Homebrew:
  `export PKG_CONFIG_PATH="$(brew --prefix)/lib/pkgconfig:$(brew --prefix)/share/pkgconfig"`.
- macOS "Compiler cc cannot compile programs" / "ld: tapi error … unknown architecture": the Command Line Tools' newest SDK is ahead of its linker. Point the build at an older SDK that's installed and retry:
  `ls /Library/Developer/CommandLineTools/SDKs/` then
  `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX<older>.sdk pip install manim`
  (or update the Command Line Tools: `softwareupdate --list`).
- `uv` users: same env vars, `uv pip install -r requirements.txt`.

## LaTeX: optional

With LaTeX, `Eq()` renders real typeset math (`MathTex`), and these work: `MathTex`, `Tex`, `DecimalNumber`, `Integer`, `Variable`, `NumberLine(include_numbers=True)`, `Axes(axis_config={"include_numbers": True})`, `ax.get_axis_labels()` with default labels, `Brace.get_text()` / `get_tex()`, `BraceLabel`. Without LaTeX, all of those raise `FileNotFoundError` (they shell out to `latex`).

- Check: `latex --version && dvisvgm --version`. `helpers.has_latex()` checks the same.
- Install (free, large): macOS `brew install --cask mactex-no-gui` (~5 GB) or `basictex` (~100 MB, then `sudo tlmgr install standalone preview doublestroke relsize fundus-calligra wasysym physics dvisvgm rsfs wasy cm-super everysel setspace babel-english ragged2e`); Linux `sudo apt install texlive texlive-latex-extra texlive-fonts-extra dvisvgm`; Windows MiKTeX.

**Without LaTeX (fallbacks in `helpers.py`):**

| Need | Use |
| --- | --- |
| An equation | `Eq(tex, plain="a² + b² = c²")`; `plain` is optional, `tex_to_plain` handles simple tex (`^2`, `_1`, `\frac{a}{b}`, `\cdot`, `\pi`, `\sqrt`, `\cdots`, Greek letters) |
| Italic variables | `Eq(..., italic="n x")` (uses `MarkupText`; don't use `Text(t2s=...)`, it shifts the baseline) |
| Morph between equations | `morph(a, b)` (uses `TransformMatchingShapes`, which matches identical glyphs) |
| Coloured terms | `Text(s, t2c={"a": P.BLUE})` |
| Numbers that change | `number(value)` inside `always_redraw` |
| Axis numbers | `tick_labels(ax.x_axis, values)` |
| Axis labels | `ax.get_axis_labels(Words("x"), Words("y"))` |
| Brace labels | `Words("n").next_to(brace, DOWN)` |
| Fractions, matrices, integrals | Build them from pieces (`Words` + `Line` for a fraction bar) or install LaTeX. Integrals and sums look poor in plain text: recommend LaTeX for those videos |

## Fonts
`palette.py` picks the first installed of CMU Serif, Latin Modern, STIX Two, Charter, Georgia. CMU Serif (the Computer Modern look, free, SIL OFL) gives the closest match to LaTeX output: install it from https://www.fontsquirrel.com/fonts/computer-modern or your package manager (`fonts-cmu` on Debian/Ubuntu). List what Manim sees: `python -c "import manimpango; print(manimpango.list_fonts())"`.

## Narration voices (`scripts/tts.py`)

| Provider | Cost | Setup |
| --- | --- | --- |
| `kokoro` (default) | free, local | `pip install kokoro-onnx soundfile`; first run downloads the model (~330 MB) to `~/.cache/kokoro-onnx`. Voices: `am_michael`, `am_adam` (US male), `af_heart`, `af_nova`, `af_sky` (US female), `bm_george` (UK male), `bf_emma` (UK female). Set in `script.json` → `voice` |
| `record` | free | the user records `audio/<Scene>/<line>.wav` per line (names printed by `tts.py --provider record`) |
| `say` | free, macOS | `voice: { "provider": "say", "voice": "Daniel", "rate": 180 }` (robotic; drafts only) |
| `piper` | free, local | install piper, download a voice `.onnx`, set `voice.model` |
| `openai` | paid | `OPENAI_API_KEY`; `voice.voice` (e.g. `ash`), optional `voice.instructions` for tone; `--paid-ok` |
| `elevenlabs` | paid | `ELEVENLABS_API_KEY`; `voice.voice_id`; `--paid-ok` |

Kokoro's speech engine (espeak-ng) can't read files from a path containing spaces; `tts.py` copies its data to the temp folder when that happens. If you call Kokoro yourself, keep the venv in a path without spaces.

## Render times
On an Apple-silicon laptop, simple 2D scenes render at -qh in a few seconds per scene; graphs with many updaters, `always_redraw` and 3D surfaces take minutes. Draft at `-ql`, render `-qh` only for review versions.
