"""Rebuild public/fonts/Overpass-subset.woff2 from the upstream variable font.

Usage (fonttools + brotli installed somewhere, e.g. a throwaway venv or --target dir):
  python3 scripts/subset_overpass.py <Overpass[wght].ttf> <out.woff2>

Upstream: https://github.com/google/fonts/tree/main/ofl/overpass (SIL OFL 1.1,
copyright text in public/fonts/OFL.txt). The app only uses weights 400 to 800,
so the weight axis is clamped to that range, then the glyphs are cut down to the
ranges below. src/fonts.test.js reads the shipped file's cmap and fails if any
character in the en/es/ca dictionaries or legal text is missing from it.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

# Basic Latin, Latin-1 Supplement, Latin Extended-A, plus the punctuation the UI uses:
# dashes, quotes, bullet, ellipsis, prime marks, euro, trademark, arrows, minus.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))
    + list(range(0x2010, 0x2016))
    + [0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2020, 0x2021, 0x2022, 0x2026,
       0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x20AC, 0x2122, 0x2212]
    + list(range(0x2190, 0x2194))
)

# Keep the figure styles (tnum is the point of this font here) and the shaping basics.
FEATURES = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'case', 'tnum', 'pnum', 'zero']


# Overpass centres its text box at 0.25 em above the baseline, but capitals and digits (badges, times, line
# numbers) are centred at 0.35 em, so in any tight box they sit high. Move the box centre to about 0.37 em by
# giving the ascent what the descent loses; the line height (ascent + descent = 2532 units) does not change.
ASCENT, DESCENT = 2000, 532  # units per em 2000 (upstream: 1766 / 766)


def set_vertical_metrics(font):
    font['hhea'].ascent, font['hhea'].descent = ASCENT, -DESCENT
    os2 = font['OS/2']
    os2.sTypoAscender, os2.sTypoDescender = ASCENT, -DESCENT  # fsSelection USE_TYPO_METRICS is set upstream


def main(src, dst):
    font = TTFont(src)
    font = instancer.instantiateVariableFont(font, {'wght': (400, 800)})
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = FEATURES
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.notdef_outline = True
    options.hinting = False
    sub = subset.Subsetter(options)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    set_vertical_metrics(font)
    font.flavor = 'woff2'
    font.save(dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
