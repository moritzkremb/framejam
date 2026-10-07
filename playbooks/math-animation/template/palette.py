"""Colours and fonts by role. Scenes use these names, never raw hex values."""
from functools import lru_cache

BG = "#1C1C1C"        # ground
INK = "#ECECEC"       # default text and strokes
DIM = "#7A7A7A"       # de-emphasised: earlier steps, guides, axes labels
BLUE = "#58C4DD"      # primary object, the main quantity
TEAL = "#5CD0B3"      # second object, its partner
GREEN = "#83C167"     # third object, "correct", growth
YELLOW = "#F7D96F"    # the one thing to look at right now (highlight, key term, result)
BROWN = "#CD853F"     # warm accent, a contrasting quantity
GOLD = "#F0AC5F"      # sequence colour after yellow
RED = "#FC6255"       # wrong, negative, the thing being removed

# For sequences (1st, 2nd, 3rd ... item). Neighbours stay distinguishable.
SEQUENCE = [BLUE, TEAL, GREEN, YELLOW, GOLD, BROWN, RED]

# Font roles. The first installed font in each list wins; Pango falls back silently otherwise.
TEXT_FONTS = ["CMU Serif", "Latin Modern Roman", "STIX Two Text", "Charter", "Georgia", "Times New Roman"]
MATH_FONTS = ["CMU Serif", "Latin Modern Math", "STIX Two Text", "STIX Two Math", "Charter", "Georgia"]

# Sizes (Manim font_size units). Keep to these four.
TITLE = 64
BODY = 48
MATH = 64
SMALL = 40


@lru_cache(maxsize=None)
def _installed():
    try:
        import manimpango
        return set(manimpango.list_fonts())
    except Exception:
        return set()


def pick_font(candidates):
    have = _installed()
    for name in candidates:
        if name in have:
            return name
    return candidates[-1]


def text_font():
    return pick_font(TEXT_FONTS)


def math_font():
    return pick_font(MATH_FONTS)
