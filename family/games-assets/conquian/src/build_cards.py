#!/usr/bin/env python3
"""Conquián deck art: writes every SVG in family/app/games-assets/conquian/ (stdlib only, deterministic).

Original art drawn in code by Claude for educatedai.org, CC0-1.0. Spanish 40-card deck conventions only
(suit colours, the "pinta" gaps in the frame: oros none, copas one, espadas two, bastos three); no printed
deck was copied. No fonts are embedded: card numerals are stroked paths; the few words (stamp, banner,
logo) use system font stacks.

    python3 family/app/games-assets/conquian/src/build_cards.py [--out DIR]
"""
import argparse
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
LICENSES = os.path.join(os.path.dirname(OUT), "LICENSES.json")
GEN = "family/app/games-assets/conquian/src/build_cards.py"
AUTHOR = "Claude, for educatedai.org"

W, H = 250, 350
INK = "#2b1d14"
PAPER = "#fbf4e2"
SUITS = ["o", "c", "e", "b"]
RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
GAPS = {"o": 0, "c": 1, "e": 2, "b": 3}

# per suit: index ink, frame colour, main, light, dark, panel gradient (court/ace backgrounds)
S = {
    "o": dict(ink="#8a4f00", frame="#c48a12", main="#e9a92a", light="#ffe08a", dark="#8a5a00",
              bg=("#fff3c9", "#f6c552"), ray="#fff8dc"),
    "c": dict(ink="#b0192a", frame="#c72b35", main="#c9303a", light="#ff8a7a", dark="#6e0c14",
              bg=("#fde3d8", "#ee8f7f"), ray="#fff1ea"),
    "e": dict(ink="#1c4b9c", frame="#2d62b8", main="#2f63b8", light="#9cc3ff", dark="#163a78",
              bg=("#e2edfc", "#8db1e6"), ray="#f3f8ff"),
    "b": dict(ink="#256b2c", frame="#33843a", main="#3f8f3a", light="#a6e07a", dark="#1d5222",
              bg=("#e7f4d8", "#9dcc7c"), ray="#f6fbef"),
}


def n(v):
    """Compact number formatting."""
    if isinstance(v, int):
        return str(v)
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    if s.startswith("0."):
        s = s[1:]
    elif s.startswith("-0."):
        s = "-" + s[2:]
    return "0" if s in ("", "-0", "-") else s


def P(*pts):
    return " ".join(n(p) for p in pts)


def svg(body, defs="", vb=(W, H), extra=""):
    w, h = vb
    d = "<defs>%s</defs>" % defs if defs else ""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d"%s>%s%s</svg>\n'
            % (w, h, w, h, extra, d, body))


# ---------------------------------------------------------------------------------------------- gradients
def lin(id_, stops, x1=0, y1=0, x2=1, y2=0):
    s = "".join('<stop offset="%s" stop-color="%s"/>' % (n(o), c) for o, c in stops)
    return '<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>' % (
        id_, n(x1), n(y1), n(x2), n(y2), s)


def rad(id_, stops, cx=.5, cy=.5, r=.5, fx=None, fy=None):
    s = "".join('<stop offset="%s" stop-color="%s"%s/>' % (
        n(o), c[0] if isinstance(c, tuple) else c,
        (' stop-opacity="%s"' % n(c[1])) if isinstance(c, tuple) else "") for o, c in stops)
    f = (' fx="%s" fy="%s"' % (n(fx), n(fy))) if fx is not None else ""
    return '<radialGradient id="%s" cx="%s" cy="%s" r="%s"%s>%s</radialGradient>' % (id_, n(cx), n(cy), n(r), f, s)


GRADS = {
    "paper": rad("paper", [(0, "#fffaf0"), (.7, "#fbf1dc"), (1, "#f1e2c0")], cy=.45, r=.75),
    "gG": lin("gG", [(0, "#fff3b0"), (.35, "#f2c442"), (.7, "#cf9318"), (1, "#8f5a06")], 0, 0, 1, 1),
    "gGv": lin("gGv", [(0, "#fff3b0"), (.45, "#e9b632"), (1, "#9a6508")], 0, 0, 0, 1),
    "oRim": lin("oRim", [(0, "#fff0a8"), (.35, "#f0bf3a"), (.7, "#c88912"), (1, "#8f5a06")], 0, 0, 1, 1),
    "oFace": rad("oFace", [(0, "#fff6cc"), (.55, "#f6c94c"), (1, "#d38f18")], cx=.4, cy=.35, r=.7),
    "gemR": rad("gemR", [(0, "#ff9a8a"), (.5, "#d3262f"), (1, "#6e0a12")], cx=.35, cy=.35, r=.7),
    "gemB": rad("gemB", [(0, "#b8dcff"), (.5, "#2f72d8"), (1, "#0f2f6e")], cx=.35, cy=.35, r=.7),
    "gemG": rad("gemG", [(0, "#c8f5a8"), (.5, "#2f9a44"), (1, "#0e4a1c")], cx=.35, cy=.35, r=.7),
    "cBowl": lin("cBowl", [(0, "#6e0c14"), (.3, "#c62a33"), (.47, "#f37a68"), (.55, "#d9393c"), (.8, "#a91c26"),
                           (1, "#5e0a12")]),
    "eBlade": lin("eBlade", [(0, "#4f72b0"), (.42, "#dce8fb"), (.5, "#ffffff"), (.58, "#a9c2e9"), (1, "#36609f")]),
    "eGrip": lin("eGrip", [(0, "#0f2f6e"), (.45, "#3a78d6"), (1, "#0f2f6e")]),
    "bWood": lin("bWood", [(0, "#5e3412"), (.3, "#b0703a"), (.48, "#dca263"), (.7, "#a8662e"), (1, "#4e2a0e")]),
    "bLeaf": lin("bLeaf", [(0, "#c4ef8a"), (.5, "#58ad3e"), (1, "#22662a")], 0, 0, 1, 1),
    "sun": rad("sun", [(0, "#fff2a8"), (.6, "#ffc23a"), (1, "#f07e1a")], r=.5),
    "glow": rad("glow", [(0, ("#ffffff", .85)), (.6, ("#ffffff", .25)), (1, ("#ffffff", 0))]),
    "rose": rad("rose", [(0, "#ff9fb4"), (.55, "#e2365e"), (1, "#8c0f33")], cx=.4, cy=.35, r=.75),
    "steel": lin("steel", [(0, "#ffffff"), (1, "#9fb6d8")], 0, 0, 0, 1),
}


def grads(*names):
    return "".join(GRADS[k] for k in names)


# --------------------------------------------------------------------------------------------- numerals
# Stroked glyphs on a 50 x 80 box (stroke centre lines; drawn with round caps and joins).
GLYPH = {
    "0": "M25 5C11 5 6 22 6 40S11 75 25 75 44 58 44 40 39 5 25 5Z",
    "1": "M12 18 27 5V75M12 75H42",
    "2": "M8 20C9 10 16 5 25 5 36 5 43 12 43 22 43 36 26 46 8 75H44",
    "3": "M9 12C14 7 19 5 25 5 35 5 42 11 42 20 42 30 34 37 22 37 36 37 44 45 44 56 44 68 35 75 24 75 16 75 10 72 6 66",
    "4": "M33 75V5L5 54H46",
    "5": "M41 5H13L10 36C15 32 20 31 25 31 36 31 44 40 44 52 44 66 35 75 24 75 16 75 10 72 6 67",
    "6": "M39 9C35 6 30 5 26 5 13 5 6 20 6 42 6 64 13 75 25 75 37 75 44 66 44 55 44 44 37 36 26 36 16 36 9 42 7 50",
    "7": "M6 5H44C32 24 24 48 21 75",
    "R": "M10 75V5H27C38 5 44 11 44 21 44 31 38 38 27 38H10M27 38 44 75",
}


def numeral(text, x, y, h, color, sw=13):
    """Rank `text` with its top-left at (x, y), `h` tall. Two characters are condensed."""
    s = h / 80.0
    out = []
    if len(text) == 1:
        out.append('<path d="%s" transform="translate(%s %s) scale(%s)"/>' % (GLYPH[text], n(x), n(y), n(s)))
    else:
        sx = s * .66
        step = 50 * sx * .98
        for i, ch in enumerate(text):
            out.append('<path d="%s" transform="translate(%s %s) scale(%s %s)"/>' % (
                GLYPH[ch], n(x + i * step - (2 if ch == "1" and i == 0 else 0)), n(y), n(sx), n(s)))
    return ('<g fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">%s</g>'
            % (color, n(sw), "".join(out)))


def numeral_width(text, h):
    s = h / 80.0
    return 50 * s if len(text) == 1 else 50 * s * .66 * .98 + 50 * s * .66


# ------------------------------------------------------------------------------------------ suit emblems
# Rich emblems in a -50..50 box, defined once per file as <g id="em-X"> and placed with <use>.
def leaf(x, y, rot, s=1.0, fill="url(#bLeaf)"):
    return ('<g transform="translate(%s %s) rotate(%s) scale(%s)"><path d="M0 0C4-7 12-9 20-6 15 1 7 4 0 0Z" '
            'fill="%s" stroke="%s" stroke-width="1"/><path d="M1-.5C7-3 12-4 17-5.5" fill="none" stroke="#1d5222" '
            'stroke-width=".7" stroke-opacity=".7"/></g>' % (n(x), n(y), n(rot), n(s), fill, INK))


def emblem(s):
    if s == "o":
        beads = "".join('<circle cx="%s" cy="%s" r="2.1"/>' % (n(41.5 * math.cos(a)), n(41.5 * math.sin(a)))
                        for a in [i * math.pi / 14 for i in range(28)])
        rays = "".join('<path d="M%s %sL%s %s"/>' % (
            n(23 * math.cos(a)), n(23 * math.sin(a)), n((33 if i % 2 == 0 else 29) * math.cos(a)),
            n((33 if i % 2 == 0 else 29) * math.sin(a))) for i, a in enumerate([k * math.pi / 12 for k in range(24)]))
        petals = "".join('<path d="M0-19C5-14 5-8 0-4-5-8-5-14 0-19Z" transform="rotate(%d)"/>' % (k * 45)
                         for k in range(8))
        return ('<g id="em-o"><circle r="46" cy="3" fill="#000" opacity=".16"/>'
                '<circle r="46" fill="url(#oRim)" stroke="%s" stroke-width="1.6"/>'
                '<g fill="#fff1b8" stroke="#7a4b00" stroke-width=".5">%s</g>'
                '<circle r="37" fill="url(#oFace)" stroke="#7a4b00" stroke-width="1.3"/>'
                '<g stroke="#a86b08" stroke-width="1.4" stroke-linecap="round">%s</g>'
                '<circle r="21" fill="none" stroke="#a86b08" stroke-width=".9" stroke-dasharray="2 2.2"/>'
                '<g fill="#ffd75a" stroke="#8a5a00" stroke-width=".8">%s</g>'
                '<circle r="5.5" fill="url(#gemR)" stroke="#5a1a0a" stroke-width=".8"/>'
                '<circle cx="-1.8" cy="-1.8" r="1.6" fill="#fff" opacity=".8"/>'
                '<path d="M-31-12A33 33 0 0 1-12-31" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3.5" '
                'stroke-linecap="round"/></g>' % (INK, beads, rays, petals))
    if s == "c":
        return ('<g id="em-c"><ellipse cy="47" rx="28" ry="4" fill="#000" opacity=".16"/>'
                '<path d="M-27 46C-25 39-12 36-6 31H6C12 36 25 39 27 46Z" fill="url(#gG)" stroke="%s" stroke-width="1.4"/>'
                '<path d="M-21 42.5H21" stroke="#9a6508" stroke-width=".9"/>'
                '<path d="M-5 8H5L4 16C11 18 11 26 4 28L5 32H-5L-4 28C-11 26-11 18-4 16Z" fill="url(#gG)" '
                'stroke="%s" stroke-width="1.4"/>'
                '<path d="M-36-38H36C36-10 22 8 0 9-22 8-36-10-36-38Z" fill="url(#cBowl)" stroke="%s" stroke-width="1.6"/>'
                '<path d="M-35.6-26C-20-20 20-20 35.6-26L34-17C20-11-20-11-34-17Z" fill="url(#gG)" stroke="%s" '
                'stroke-width="1"/>'
                '<circle cx="-19" cy="-17.5" r="3" fill="url(#gemB)" stroke="%s" stroke-width=".7"/>'
                '<circle cy="-15.5" r="3.6" fill="url(#gemG)" stroke="%s" stroke-width=".7"/>'
                '<circle cx="19" cy="-17.5" r="3" fill="url(#gemB)" stroke="%s" stroke-width=".7"/>'
                '<path d="M-14 -4C-8 2 8 2 14-4" fill="none" stroke="#ffd6c8" stroke-opacity=".5" stroke-width="1"/>'
                '<ellipse cy="-38" rx="36" ry="6" fill="url(#gG)" stroke="%s" stroke-width="1.4"/>'
                '<ellipse cy="-38" rx="30" ry="3.4" fill="#4a0810"/>'
                '<path d="M-27-30C-27-14-20-4-10 1" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="4" '
                'stroke-linecap="round"/></g>' % ((INK,) * 8))
    if s == "e":
        wraps = "".join('<path d="M-4.5 %sL4.5 %s"/>' % (n(29 + 3.4 * i), n(26 + 3.4 * i)) for i in range(5))
        return ('<g id="em-e"><path d="M2-48 9.5-36 8 22H-4Z" fill="#000" opacity=".12"/>'
                '<path d="M0-50 7.5-38 6 20H-6L-7.5-38Z" fill="url(#eBlade)" stroke="%s" stroke-width="1.3" '
                'stroke-linejoin="round"/>'
                '<path d="M0-40V16" stroke="#2a4f8f" stroke-width="1.6" stroke-opacity=".5"/>'
                '<path d="M-29 19C-25 13-14 21 0 17 14 21 25 13 29 19 32 24 26 31 21 27 13 30 7 26 0 28-7 26-13 30-21 27'
                '-26 31-32 24-29 19Z" fill="url(#gG)" stroke="%s" stroke-width="1.3"/>'
                '<circle cx="-27" cy="23" r="2" fill="#9a6508"/><circle cx="27" cy="23" r="2" fill="#9a6508"/>'
                '<circle cy="23" r="3.6" fill="url(#gemB)" stroke="%s" stroke-width=".8"/>'
                '<rect x="-4.6" y="27" width="9.2" height="16" rx="2" fill="url(#eGrip)" stroke="%s" stroke-width="1.1"/>'
                '<g stroke="#bcd4ff" stroke-width=".9" stroke-opacity=".8">%s</g>'
                '<circle cy="47.5" r="5" fill="url(#gG)" stroke="%s" stroke-width="1.2"/>'
                '<path d="M-2.6-36V12" stroke="#fff" stroke-opacity=".8" stroke-width="1.6"/></g>' % (
                    INK, INK, INK, INK, wraps, INK))
    if s == "b":
        return ('<g id="em-b"><path d="M-3 50 7 50 10-40H-8Z" fill="#000" opacity=".1"/>'
                + leaf(-14, -27, -150, .9) + leaf(13, -29, -35, .85) + leaf(10, 15, 10, .75) +
                '<path d="M-5 48C-6 36-7 24-8 12-12 10-13 4-9 2-10-8-11-16-13-22-18-24-18-31-13-31-15-38-14-46 0-47 '
                '14-46 15-40 13-34 18-33 18-26 12-26 11-14 10-2 8 10 12 12 12 18 7 19 6 30 5 40 5 48Z" '
                'fill="url(#bWood)" stroke="%s" stroke-width="1.4" stroke-linejoin="round"/>'
                '<ellipse cy="-42" rx="10" ry="3.8" fill="#ecc68e" stroke="#7a4a20" stroke-width=".8"/>'
                '<ellipse cy="-42" rx="5" ry="1.8" fill="none" stroke="#a8662e" stroke-width=".7"/>'
                '<ellipse cx="-2" cy="-14" rx="2.4" ry="4" fill="#5e3412"/><ellipse cx="-2" cy="-14" rx="1" ry="2" fill="#c08048"/>'
                '<ellipse cx="2.5" cy="26" rx="1.8" ry="3" fill="#5e3412"/>'
                '<g fill="none" stroke="#5e3412" stroke-width=".7" stroke-opacity=".55">'
                '<path d="M-6-36C-7-26-6-18-5-8M5-34C6-22 5-10 3 4M-3 8C-3 20-2 32-1 44"/></g>'
                '<path d="M-8.7 30H8.2L7.9 37H-8.3Z" fill="#2f8a3a" stroke="%s" stroke-width="1"/>'
                '<path d="M-8.3 33.5H7.9" stroke="#bfe89a" stroke-width="1" stroke-dasharray="2 1.5"/>'
                '<path d="M-10.6-6H10.3L10.1 0H-10.2Z" fill="#2f8a3a" stroke="%s" stroke-width="1"/>'
                '<path d="M-9-34C-10-20-7 0-5 28" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.5" '
                'stroke-linecap="round"/></g>' % (INK, INK, INK))
    raise ValueError(s)


EMBLEM_GRADS = {"o": ["oRim", "oFace", "gemR"], "c": ["gG", "cBowl", "gemB", "gemG"],
                "e": ["gG", "eBlade", "eGrip", "gemB"], "b": ["bWood", "bLeaf"]}

# Flat, bold silhouettes for the corner index (they must read at a few pixels).
MINI = {
    "o": '<circle r="40" fill="#f0b52a" stroke="%s" stroke-width="7"/><circle r="19" fill="none" stroke="#9a5f00" '
         'stroke-width="7"/>' % INK,
    "c": '<path d="M-40-42H40C40-6 20 8 7 10V24C19 28 28 34 30 46H-30C-28 34-19 28-7 24V10C-20 8-40-6-40-42Z" '
         'fill="#d42d36" stroke="%s" stroke-width="6.5" stroke-linejoin="round"/>' % INK,
    "e": '<path d="M0-52 11-36V14H28V26H8V36L12 48H-12L-8 36V26H-28V14H-11V-36Z" fill="#2f66c8" stroke="%s" '
         'stroke-width="6.5" stroke-linejoin="round"/>' % INK,
    "b": '<path d="M-8 48-16-28C-19-50 19-50 16-28L8 48Z" fill="#3f9a3c" stroke="%s" stroke-width="6.5" '
         'stroke-linejoin="round"/><circle cx="-15" cy="-6" r="0" />' % INK,
}


def mini(s, x, y, size):
    return '<g transform="translate(%s %s) scale(%s)">%s</g>' % (n(x), n(y), n(size / 100.0), MINI[s])


# --------------------------------------------------------------------------------------------- the card
def frame(s, inset=9, r=9, color=None, sw=2.2):
    """Frame line with the traditional 'pinta' gaps at top and bottom centre."""
    color = color or S[s]["frame"]
    L, T, R, B = inset, inset, W - inset, H - inset
    g = GAPS[s]
    gw, sp = 11, 9  # gap width, segment between gaps
    if g == 0:
        d = ("M%s %sH%sA%s %s 0 0 1 %s %sV%sA%s %s 0 0 1 %s %sH%sA%s %s 0 0 1 %s %sV%sA%s %s 0 0 1 %s %sZ" % (
            n(L + r), n(T), n(R - r), r, r, n(R), n(T + r), n(B - r), r, r, n(R - r), n(B), n(L + r), r, r, n(L),
            n(B - r), n(T + r), r, r, n(L + r), n(T)))
    else:
        tot = g * gw + (g - 1) * sp
        x0 = W / 2 - tot / 2
        gaps = [(x0 + i * (gw + sp), x0 + i * (gw + sp) + gw) for i in range(g)]
        a, b = gaps[0][0], gaps[-1][1]
        d = ("M%s %sH%sA%s %s 0 0 0 %s %sV%sA%s %s 0 0 0 %s %sH%s" % (
            n(a), n(T), n(L + r), r, r, n(L), n(T + r), n(B - r), r, r, n(L + r), n(B), n(a)))
        d += ("M%s %sH%sA%s %s 0 0 0 %s %sV%sA%s %s 0 0 0 %s %sH%s" % (
            n(b), n(T), n(R - r), r, r, n(R), n(T + r), n(B - r), r, r, n(R - r), n(B), n(b)))
        for i in range(g - 1):
            u, v = gaps[i][1], gaps[i + 1][0]
            d += "M%s %sH%sM%s %sH%s" % (n(u), n(T), n(v), n(u), n(B), n(v))
    return '<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"/>' % (d, color, n(sw))


def corner_index(s, label, badge=False, ink=None, suit_svg=None):
    ink = ink or S[s]["ink"]
    h = 50
    wdt = numeral_width(label, h)
    cx = 33
    x = cx - wdt / 2
    g = []
    if badge:
        g.append('<path d="M13 10H53Q56 10 56 13V103Q56 110 49 110H17Q10 110 10 103V13Q10 10 13 10Z" fill="%s" '
                 'stroke="%s" stroke-width="1.6"/>' % (PAPER, S[s]["frame"]))
    g.append(numeral(label, x, 16, h, ink, sw=14))
    g.append(suit_svg if suit_svg else mini(s, cx, 90, 26))
    one = "".join(g)
    return '<g>%s</g><g transform="rotate(180 125 175)">%s</g>' % (one, one)


def card(s, label, art, defs="", badge=False, index_ink=None, suit_svg=None, gaps_suit=None):
    base = ('<rect width="250" height="350" rx="14" fill="url(#paper)"/>'
            '<rect x=".75" y=".75" width="248.5" height="348.5" rx="13.3" fill="none" stroke="%s" '
            'stroke-opacity=".35" stroke-width="1.5"/>' % INK)
    body = (base + frame(gaps_suit or s) + art +
            corner_index(s, label, badge=badge, ink=index_ink, suit_svg=suit_svg))
    return svg(body, defs=GRADS["paper"] + defs)


# ----------------------------------------------------------------------------------------------- pips
PIPS = {
    2: (.92, [(125, 92), (125, 258)]),
    3: (.78, [(125, 72), (125, 175), (125, 278)]),
    4: (.72, [(88, 92), (162, 92), (88, 258), (162, 258)]),
    5: (.68, [(88, 82), (162, 82), (125, 175), (88, 268), (162, 268)]),
    6: (.64, [(88, 72), (162, 72), (88, 175), (162, 175), (88, 278), (162, 278)]),
    7: (.56, [(88, 66), (162, 66), (125, 121), (88, 176), (162, 176), (88, 282), (162, 282)]),
}


def pip_card(s, r):
    sc, pos = PIPS[r]
    tilt = 11 if s in "eb" else 0
    uses = []
    for x, y in pos:
        a = 0 if x == 125 else (-tilt if x < 125 else tilt)
        k = sc * (1.12 if s in "eb" else 1)
        uses.append('<use href="#em-%s" transform="translate(%s %s) rotate(%s) scale(%s)"/>' % (
            s, n(x), n(y), n(a), n(k)))
    defs = grads(*EMBLEM_GRADS[s]) + emblem(s)
    return card(s, str(r), "".join(uses), defs=defs)




# ------------------------------------------------------------------------------------------ figure kit
def limb(pts, w, col, ow=1.6):
    """A posable limb: an inked stroke under a coloured stroke through 2-4 points."""
    p = ["%s %s" % (n(x), n(y)) for x, y in pts]
    d = "M" + p[0] + ({2: "L", 3: "Q", 4: "C"}[len(p)]) + " ".join(p[1:])
    return ('<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"/>'
            '<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round"/>'
            % (d, INK, n(w + 2 * ow), d, col, n(w)))


def hand(x, y, skin, r=5.6):
    return '<circle cx="%s" cy="%s" r="%s" fill="%s" stroke="%s" stroke-width="1.3"/>' % (n(x), n(y), n(r), skin, INK)


def shape(d, fill, sw=1.5, extra=""):
    return '<path d="%s" fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round"%s/>' % (d, fill, INK, n(sw), extra)


def held(s, x, y, rot=0, sc=.5):
    """The suit object with its grip point at (x, y)."""
    ax, ay = {"o": (0, 0), "c": (0, 22), "e": (0, 35), "b": (0, 40)}[s]
    return '<use href="#em-%s" transform="translate(%s %s) rotate(%s) scale(%s) translate(%s %s)"/>' % (
        s, n(x), n(y), n(rot), n(sc), n(-ax), n(-ay))


def head(x, y, sc, skin, hair, kind, dx=0.0, beard=None, hat=None, hatc=None, hatc2=None):
    """A folk-art head; face centre at (x, y). kind: page | knight | king | queen."""
    g = []
    if kind == "queen":
        g.append(shape("M-17-10C-27 8-25 34-19 50-10 54 10 54 19 50 25 34 27 8 17-10Z", hair, 1.3))
    if kind == "king":
        g.append(shape("M-17-6C-21 6-20 16-16 22H16C20 16 21 6 17-6Z", hair, 1.3))
    g.append('<circle cx="-15" cy="2" r="3.6" fill="%s" stroke="%s" stroke-width="1.2"/>' % (skin, INK))
    g.append('<circle cx="15" cy="2" r="3.6" fill="%s" stroke="%s" stroke-width="1.2"/>' % (skin, INK))
    g.append('<ellipse rx="15" ry="17.5" fill="%s" stroke="%s" stroke-width="1.4"/>' % (skin, INK))
    if kind == "page":
        g.append(shape("M-15.5-4C-17-14-10-19 0-19 10-19 17-14 15.5-4 12-9 7-7 3-10-1-7-6-9-9-6-12-9-14-6-15.5-4Z",
                       hair, 1.1))
        g.append(shape("M-15.5-4C-17 2-17 8-15 12-13 8-13 2-12-3ZM15.5-4C17 2 17 8 15 12 13 8 13 2 12-3Z", hair, .9))
    if kind == "knight":
        g.append(shape("M-15-5C-16-13-9-17 0-17 9-17 16-13 15-5 9-9-9-9-15-5Z", hair, 1))
    if kind == "queen":
        g.append(shape("M-15.5-2C-16-14-8-19 0-19 8-19 16-14 15.5-2 12-12 4-13 0-9-4-13-12-12-15.5-2Z", hair, 1.1))
    if kind == "king":
        g.append(shape("M-15-6C-16-13-9-16 0-16 9-16 16-13 15-6 8-9-8-9-15-6Z", hair, 1))
    for sx in (-1, 1):
        ex = sx * 5.6 + dx
        if kind == "queen":
            g.append('<path d="M%s 0Q%s -2.6 %s 0" fill="none" stroke="%s" stroke-width="1.4" stroke-linecap="round"/>'
                     % (n(ex - 2.6), n(ex), n(ex + 2.6), INK))
            g.append('<path d="M%s .2l%s -1.6" stroke="%s" stroke-width=".9"/>' % (n(ex + sx * 2.4), n(sx * 1.4), INK))
        else:
            g.append('<ellipse cx="%s" cy="0" rx="1.8" ry="2.4" fill="%s"/>' % (n(ex), INK))
            g.append('<circle cx="%s" cy="-.8" r=".6" fill="#fff"/>' % n(ex + .5))
        g.append('<path d="M%s -5.6Q%s -8 %s -6" fill="none" stroke="%s" stroke-width="1.3" stroke-linecap="round"/>'
                 % (n(ex - 3.2 * sx), n(ex), n(ex + 3 * sx), INK))
        g.append('<circle cx="%s" cy="6.8" r="3.4" fill="#ef5f55" opacity=".38"/>' % n(sx * 8.6 + dx))
    g.append('<path d="M%s 1Q%s 6 %s 6.6" fill="none" stroke="#9a5032" stroke-width="1.2" stroke-linecap="round"/>'
             % (n(dx + .4), n(dx + 2.6), n(dx - .6)))
    if kind == "queen":
        g.append('<path d="M%s 10.6Q%s 9.2 %s 10.6 %s 13.6 %s 10.6Z" fill="#c22a46" stroke="#7a1028" stroke-width=".6"/>'
                 % (n(dx - 3.4), n(dx), n(dx + 3.4), n(dx), n(dx - 3.4)))
    elif not beard:
        g.append('<path d="M%s 10.6Q%s 13.4 %s 10.6" fill="none" stroke="#7a2a1e" stroke-width="1.3" '
                 'stroke-linecap="round"/>' % (n(dx - 3.4), n(dx), n(dx + 3.4)))
    if beard:
        g.append(shape("M-15 1C-16 18-10 31 0 35 10 31 16 18 15 1 12 9 8 12 3 12 1 10-1 10-3 12-8 12-12 9-15 1Z",
                       hair, 1.2))
        g.append('<path d="M-4 22 0 30M4 22 0 30M-8 16-6 24M8 16 6 24" stroke="%s" stroke-opacity=".35" '
                 'stroke-width=".9" fill="none"/>' % INK)
        g.append('<path d="M%s 14.6Q%s 16.8 %s 14.6" fill="none" stroke="#7a2a1e" stroke-width="1.3" '
                 'stroke-linecap="round"/>' % (n(dx - 3), n(dx), n(dx + 3)))
    if kind in ("knight", "king"):
        g.append(shape("M{0} 8.4C{1} 6.6 {2} 7.4 {3} 11.4 {4} 9.6 {5} 10.2 {0} 9.6 {6} 10.2 {7} 9.6 {8} 11.4 "
                       "{9} 7.4 {10} 6.6 {0} 8.4Z".format(n(dx), n(dx - 3), n(dx - 8.5), n(dx - 11), n(dx - 7.4),
                                                       n(dx - 3), n(dx + 3), n(dx + 7.4), n(dx + 11), n(dx + 8.5),
                                                       n(dx + 3)), hair, .8))
    if hat == "beret":
        g.append(shape("M-21-9C-24-22-8-31 5-29 19-27 25-18 21-9 10-13-10-13-21-9Z", hatc, 1.4))
        g.append(shape("M-20-10C-10-14 10-14 20-10L19-6C10-9-10-9-19-6Z", hatc2, 1.1))
        g.append(shape("M12-24C18-40 34-50 46-44 38-40 30-34 20-22Z", "#fffaf0", 1.1))
        g.append('<path d="M16-24C24-36 34-42 42-43" fill="none" stroke="%s" stroke-width=".8"/>' % INK)
        g.append('<circle cx="13" cy="-22" r="3.2" fill="url(#gemR)" stroke="%s" stroke-width=".8"/>' % INK)
    if hat == "sombrero":
        g.append(shape("M-12-13C-13-30-8-38 0-38 8-38 13-30 12-13Z", hatc, 1.4))
        g.append(shape("M-12.6-20H12.6L12.2-14H-12.2Z", hatc2, 1))
        g.append(shape("M-36-10C-30-17-14-14 0-14 14-14 30-17 36-10 38-4 30-4 24-7 10-10-10-10-24-7-30-4-38-4-36-10Z",
                       hatc, 1.4))
        g.append('<path d="M-31-8C-18-11 18-11 31-8" fill="none" stroke="%s" stroke-width="1.6" stroke-dasharray="2.5 2"/>'
                 % hatc2)
    if hat in ("crown", "qcrown"):
        tall = 1.0 if hat == "crown" else .85
        pts = [(-17, -11), (-19, -34 * tall), (-10, -24 * tall), (-5, -40 * tall), (0, -27 * tall), (5, -40 * tall),
               (10, -24 * tall), (19, -34 * tall), (17, -11)]
        g.append(shape("M" + " ".join("%s %s" % (n(a), n(b)) for a, b in pts) + "Z", "url(#gGv)", 1.4))
        for bx, by in ((-19, -34 * tall), (-5, -40 * tall), (5, -40 * tall), (19, -34 * tall)):
            g.append('<circle cx="%s" cy="%s" r="2.6" fill="#fff3b0" stroke="%s" stroke-width=".9"/>' % (
                n(bx), n(by - 2), INK))
        g.append(shape("M-17.5-17H17.5L17-10H-17Z", "url(#gGv)", 1.1))
        g.append('<circle cx="0" cy="-13.5" r="2.6" fill="url(#gemR)" stroke="%s" stroke-width=".7"/>' % INK)
        g.append('<circle cx="-10" cy="-13.5" r="1.9" fill="url(#gemB)" stroke="%s" stroke-width=".6"/>' % INK)
        g.append('<circle cx="10" cy="-13.5" r="1.9" fill="url(#gemG)" stroke="%s" stroke-width=".6"/>' % INK)
    return '<g transform="translate(%s %s) scale(%s)">%s</g>' % (n(x), n(y), n(sc), "".join(g))


def rays(cx, cy, col, k=28, op=.4):
    out = []
    for i in range(k):
        a0 = 2 * math.pi * i / k
        a1 = a0 + math.pi / k
        out.append("M%s %sL%s %sL%s %sZ" % (n(cx), n(cy), n(cx + 400 * math.cos(a0)), n(cy + 400 * math.sin(a0)),
                                            n(cx + 400 * math.cos(a1)), n(cy + 400 * math.sin(a1))))
    return '<path d="%s" fill="%s" opacity="%s"/>' % ("".join(out), col, n(op))


def bunting(y, cols):
    """Papel picado flags across the top of the panel."""
    out = ['<path d="M14 %sQ125 %s 236 %s" fill="none" stroke="%s" stroke-width="1"/>' % (n(y), n(y + 20), n(y), INK)]
    for i, x in enumerate(range(30, 232, 22)):
        t = (x - 14) / 222.0
        yy = y + 20 * 2 * t * (1 - t)
        c = cols[i % len(cols)]
        out.append('<path d="M%s %sH%sV%sL%s %sL%s %sZ" fill="%s" stroke="%s" stroke-width=".8"/>' % (
            n(x - 8), n(yy), n(x + 8), n(yy + 13), n(x + 4), n(yy + 16), n(x - 4), n(yy + 16), c, INK))
        out.append('<circle cx="%s" cy="%s" r="2.2" fill="#fffaf0" opacity=".85"/>' % (n(x), n(yy + 7)))
    return "".join(out)


def tiles(y0, c1, c2):
    """A talavera tile floor from y0 to the panel bottom."""
    out = ['<rect x="18" y="%s" width="214" height="%s" fill="#f7efdc"/>' % (n(y0), n(332 - y0))]
    for i, x in enumerate(range(18, 232, 22)):
        for j, yy in enumerate(range(int(y0), 332, 22)):
            cx, cy = x + 11, yy + 11
            out.append('<path d="M%s %sl6 6-6 6-6-6Z" fill="%s"/>' % (n(cx), n(cy - 6), c1 if (i + j) % 2 else c2))
            out.append('<circle cx="%s" cy="%s" r="1.8" fill="#f7efdc"/>' % (n(cx), n(cy)))
    grid = "".join("M%s %sV332" % (n(x), n(y0)) for x in range(40, 232, 22)) + "".join(
        "M18 %sH232" % n(yy) for yy in range(int(y0) + 22, 332, 22))
    out.append('<path d="%s" stroke="%s" stroke-opacity=".25" stroke-width=".8"/>' % (grid, INK))
    out.append('<path d="M18 %sH232" stroke="%s" stroke-width="1.4"/>' % (n(y0), INK))
    return "".join(out)


PANEL = '<clipPath id="pnl"><rect x="18" y="18" width="214" height="314" rx="6"/></clipPath>'
PANEL_EDGE = '<rect x="18" y="18" width="214" height="314" rx="6" fill="none" stroke="%s" stroke-width="2"/>' % INK


def panel_bg(s, cx=125, cy=110):
    return '<rect x="18" y="18" width="214" height="314" fill="url(#pbg)"/>' + rays(cx, cy, S[s]["ray"], 28, .45)


def panel_grad(s):
    a, b = S[s]["bg"]
    return rad("pbg", [(0, a), (1, b)], cx=.5, cy=.3, r=.85)


COURT = {
    "o": dict(main="#e3a51f", second="#b8322a", accent="#1f7f86", trim="#fff1b8"),
    "c": dict(main="#c7302f", second="#2b5aa8", accent="#e3a51f", trim="#ffe2c8"),
    "e": dict(main="#2a5fb0", second="#e7892a", accent="#c7302f", trim="#dfeaff"),
    "b": dict(main="#3f8f3a", second="#e07a2a", accent="#b8322a", trim="#e8f6d8"),
}
SKIN = {"o": "#f0c49c", "c": "#d9a072", "e": "#c4875a", "b": "#e8b48a"}
HAIR = {"o": "#4a2a14", "c": "#2a1a12", "e": "#6a3a1a", "b": "#3a2418"}
KING_HAIR = {"o": "#d8d2c4", "c": "#3a2418", "e": "#7a4a2a", "b": "#a8a29a"}


def zigzag(x0, x1, y, h=3.5, step=7, col="#fff", sw=1.4):
    pts = []
    x, up = x0, True
    while x <= x1:
        pts.append("%s %s" % (n(x), n(y - h / 2 if up else y + h / 2)))
        x += step / 2.0
        up = not up
    return '<path d="M%s" fill="none" stroke="%s" stroke-width="%s" stroke-linejoin="round"/>' % ("L".join(pts), col, n(sw))


def brocade(col, op=.5):
    return ('<pattern id="brc" width="14" height="14" patternUnits="userSpaceOnUse"><g fill="%s" opacity="%s">'
            '<circle cx="7" cy="4.6" r="1.1"/><circle cx="7" cy="9.4" r="1.1"/><circle cx="4.6" cy="7" r="1.1"/>'
            '<circle cx="9.4" cy="7" r="1.1"/><circle cx="0" cy="0" r=".9"/><circle cx="14" cy="0" r=".9"/>'
            '<circle cx="0" cy="14" r=".9"/><circle cx="14" cy="14" r=".9"/></g></pattern>' % (col, n(op)))


def court_defs(s, extra=""):
    return PANEL + panel_grad(s) + extra + grads("gGv", "gemR", "gemB", "gemG", *EMBLEM_GRADS[s]) + emblem(s)


def court_card(s, label, g, defs):
    art = '<g clip-path="url(#pnl)">%s</g>%s' % ("".join(g), PANEL_EDGE)
    return card(s, label, art, defs=defs, badge=True)


# ------------------------------------------------------------------------------------------------ Sota
def sota(s):
    c = COURT[s]
    skin, hair = SKIN[s], HAIR[s]
    hose = {"o": "#7a2a24", "c": "#f3e6cc", "e": "#1d3f7a", "b": "#5a3a1e"}[s]
    tunic, cape = c["second"], c["main"]
    if s == "c":
        tunic = "#f4e7c9"
    g = [panel_bg(s, 125, 84), bunting(26, [c["main"], c["accent"], "#f4efe3", c["second"]]),
         tiles(296, c["main"], c["second"] if s != "c" else c["accent"])]
    g.append(shape("M99 112C82 150 74 205 70 246 86 240 104 244 125 240 146 244 164 240 180 246 176 205 168 150 151 112Z",
                   cape, 1.6))
    g.append('<path d="M84 200C80 220 78 234 76 242M166 200C170 220 172 234 174 242" stroke="%s" stroke-opacity=".25" '
             'stroke-width="2" fill="none"/>' % INK)
    g.append(limb([(115, 226), (113, 262), (110, 300)], 14, hose))
    g.append(limb([(135, 226), (137, 262), (140, 300)], 14, hose))
    g.append(shape("M97 306C97 298 104 296 112 298L117 302C117 308 110 310 100 310 97 310 97 308 97 306Z", "#3a2418", 1.3))
    g.append(shape("M153 306C153 298 146 296 138 298L133 302C133 308 140 310 150 310 153 310 153 308 153 306Z",
                   "#3a2418", 1.3))
    g.append(shape("M100 112C94 112 92 118 93 126L99 176C92 196 87 212 85 228 101 234 113 231 125 234 137 231 149 234 "
                   "165 228 163 212 158 196 151 176L157 126C158 118 156 112 150 112 140 118 110 118 100 112Z", tunic, 1.6))
    g.append('<path d="M100 112C94 112 92 118 93 126L99 176C92 196 87 212 85 228 101 234 113 231 125 234 137 231 149 234 '
             '165 228 163 212 158 196 151 176L157 126C158 118 156 112 150 112 140 118 110 118 100 112Z" fill="url(#brc)"/>')
    g.append('<path d="M86.5 222C101 228 113 225 125 228 137 225 149 228 163.5 222" fill="none" stroke="%s" '
             'stroke-width="4"/>' % c["accent"])
    g.append(zigzag(92, 158, 214, 4, 7, c["accent"] if s != "c" else c["main"], 1.6))
    g.append('<path d="M125 120V172" stroke="%s" stroke-width="5"/>' % c["accent"])
    g.append("".join('<circle cx="125" cy="%d" r="2" fill="%s" stroke="%s" stroke-width=".6"/>' % (y, c["trim"], INK)
                     for y in (128, 140, 152, 164)))
    g.append(shape("M98 172C110 177 140 177 152 172L153 182C140 187 110 187 97 182Z", "#3a2418", 1.2))
    g.append(shape("M120 171H130V188H120Z", "url(#gGv)", 1))
    g.append("".join('<circle cx="%s" cy="114" r="4.4" fill="#fffaf0" stroke="%s" stroke-width=".9"/>' % (n(x), INK)
                     for x in range(108, 144, 6)))
    hat_c = {"o": "#1f7f86", "c": "#2b5aa8", "e": "#c7302f", "b": "#b8322a"}[s]
    g.append(head(125, 86, 1.12, skin, hair, "page", dx={"o": 0, "c": -2, "e": 2.5, "b": -2.5}[s], hat="beret",
                  hatc=hat_c, hatc2=c["main"] if s != "o" else "#e3a51f"))
    sl = tunic if s != "c" else c["second"]
    puff = "".join(
        '<circle cx="%s" cy="121" r="10" fill="%s" stroke="%s" stroke-width="1.4"/><path d="M%s 112V130M%s 112V130" '
        'stroke="%s" stroke-width="1.6"/>' % (n(x), cape, INK, n(x - 4), n(x + 4), c["trim"]) for x in (100, 150))
    if s == "o":
        g.append(limb([(100, 122), (90, 160), (104, 168)], 13, sl))
        g.append(limb([(150, 122), (160, 160), (146, 168)], 13, sl))
        g.append(puff)
        g.append(held("o", 125, 160, 0, .52))
        g.append(hand(103, 166, skin) + hand(147, 166, skin))
    elif s == "c":
        g.append(limb([(150, 122), (168, 150), (150, 172)], 13, sl))
        g.append(hand(150, 172, skin))
        g.append(limb([(100, 122), (78, 104), (80, 72)], 13, sl))
        g.append(puff)
        g.append(held("c", 80, 70, -8, .5))
        g.append(hand(80, 72, skin))
    elif s == "e":
        g.append(limb([(100, 122), (80, 150), (100, 174)], 13, sl))
        g.append(hand(100, 174, skin))
        g.append(held("e", 176, 168, 180, 1.32))
        g.append(limb([(150, 122), (170, 140), (176, 166)], 13, sl))
        g.append(puff)
        g.append(hand(176, 168, skin, 6.2))
    else:
        g.append(held("b", 72, 160, 4, 1.1))
        g.append(limb([(100, 122), (84, 150), (74, 158)], 13, sl))
        g.append(limb([(150, 122), (172, 108), (176, 78)], 13, sl))
        g.append(puff)
        g.append(hand(74, 158, skin, 6.2))
        g.append(hand(176, 76, skin, 6.2))
    return court_card(s, "10", g, court_defs(s, brocade("#7a1a1a" if s == "c" else "#fff3c0", .35 if s == "c" else .45)))


# --------------------------------------------------------------------------------------------- Caballo
HORSE = ("M40 66C56 54 84 56 104 56 120 56 130 50 136 40 142 28 152 16 162 10L163 0 170 8C180 12 192 26 199 38 203 45 "
         "200 53 192 52 186 51 180 49 176 47 170 54 166 66 164 80 164 96 158 106 148 110 120 118 80 118 60 112 44 108 34 "
         "92 36 80 36 74 37 69 40 66Z")


def caballo(s):
    c = COURT[s]
    skin, hair = SKIN[s], HAIR[s]
    coat, coat2, mane = {"o": ("#f6eedd", "#d9cdb4", "#cfc2a6"), "c": ("#b8642c", "#8a4418", "#3a2014"),
                         "e": ("#cfd3dc", "#9aa2b2", "#4a4e5a"), "b": ("#4a4340", "#2a2523", "#121010")}[s]
    g = [panel_bg(s, 125, 120)]
    g.append(shape("M18 250C60 226 100 236 140 246 180 232 210 226 232 236V332H18Z", "#fff", 0, ' opacity=".4"'))
    g.append(shape("M18 296C70 284 160 286 232 294V332H18Z", "#c9a46a", 1.2))
    g.append('<path d="M30 306h10M60 316h14M120 310h10M170 318h14M200 304h8" stroke="%s" stroke-opacity=".35" '
             'stroke-width="1.4"/>' % INK)
    nopal = '<g transform="translate(%s)">%s%s%s</g>' % (
        "40 252" if s not in "cb" else "210 252 scale(-1 1)",
        shape("M0 44C-6 30-4 16 2 12 8 16 10 30 6 44Z", "#4f9a48", 1.2),
        shape("M2 22C-8 14-14 2-8-4-2-2 0 10 2 22Z", "#5aa852", 1.2),
        shape("M4 18C10 8 20 2 24 8 22 14 14 18 4 18Z", "#5aa852", 1.2))
    h = []
    h.append(limb([(72, 104), (86, 126), (66, 140), (74, 162)], 11, coat2))
    h.append(limb([(140, 104), (146, 134), (148, 162)], 11, coat2))
    h.append('<circle cx="74" cy="164" r="5.6" fill="#2b211c"/><circle cx="148" cy="164" r="5.6" fill="#2b211c"/>')
    h.append(shape("M40 70C22 72 14 94 16 122 18 134 24 140 30 144 28 126 30 108 36 94 39 84 41 76 40 70Z", mane, 1.4))
    h.append('<path d="M34 80C26 96 22 114 24 134M38 86C32 100 28 116 28 132" stroke="#fff" stroke-opacity=".25" '
             'stroke-width="1" fill="none"/>')
    h.append(shape("M158 8 160-2 166 6Z", coat2, 1.2))
    h.append(shape(HORSE, "url(#coat)", 1.7))
    if s in ("o", "e"):
        h.append("".join('<circle cx="%d" cy="%d" r="%s" fill="%s" opacity=".35"/>' % (x, y, n(r), coat2)
                         for x, y, r in ((56, 84, 6), (70, 98, 5), (52, 100, 4), (140, 90, 5), (150, 76, 4), (66, 76, 3.5))))
    h.append('<path d="M60 112C80 116 120 116 148 110" stroke="%s" stroke-opacity=".25" stroke-width="5" fill="none"/>' % INK)
    h.append(shape("M134 46C140 30 150 16 162 10 166 16 160 20 162 26 156 28 156 34 152 36 150 40 148 46 142 48 140 52 "
                   "136 52Z", mane, 1.2))
    h.append(shape("M162 10C168 10 172 14 170 20 166 18 164 16 162 10Z", mane, 1))
    h.append('<ellipse cx="180" cy="24" rx="2.6" ry="2.2" fill="%s"/><circle cx="181" cy="23.2" r=".8" fill="#fff"/>' % INK)
    h.append('<ellipse cx="195" cy="45" rx="1.6" ry="1.1" fill="%s"/>' % INK)
    h.append('<path d="M186 50.6 193 50" stroke="%s" stroke-width="1"/>' % INK)
    h.append('<path d="M168 12 186 48M170 32 197 40M168 12 176 10" fill="none" stroke="%s" stroke-width="2.6"/>' % c["main"])
    h.append('<circle cx="186" cy="48" r="2.4" fill="url(#gGv)" stroke="%s" stroke-width=".7"/>' % INK)
    h.append('<path d="M128 70C142 84 154 94 162 90" fill="none" stroke="%s" stroke-width="4"/>' % c["second"])
    h.append("".join('<path d="M%d %dl-1 9" stroke="%s" stroke-width="2.4" stroke-linecap="round"/>' % (x, y, c["accent"])
                     for x, y in ((138, 80), (147, 88), (156, 92))))
    h.append(shape("M78 56C94 52 114 52 128 56L130 98C114 104 92 104 74 98Z", c["main"], 1.5))
    h.append(zigzag(78, 128, 92, 5, 8, c["trim"], 1.8))
    h.append('<path d="M76 99C92 106 114 106 130 99" stroke="%s" stroke-width="3" stroke-dasharray="1.6 2.4" fill="none"/>'
             % c["accent"])
    h.append(shape("M86 54C92 44 116 44 122 54L120 62H88Z", "#6a3a1a", 1.4))
    h.append(shape("M118 52C120 44 124 40 128 40 130 42 128 46 124 50Z", "#6a3a1a", 1.2))
    pants = {"o": "#3a2418", "c": "#2a2a3a", "e": "#3a2418", "b": "#2a2a3a"}[s]
    jacket = {"o": "#1f4f56", "c": "#2b2f4a", "e": "#2a5fb0", "b": "#2f5a2a"}[s]
    h.append(shape("M90 50C88 32 90 16 96 8 104 2 118 2 124 8 128 20 128 36 124 52Z", jacket, 1.5))
    h.append(shape("M104 6 110 26 116 6Z", "#fffaf0", 1))
    h.append(shape("M104 8 110 4 116 8 110 11Z", c["main"], 1))
    h.append('<path d="M96 14C98 24 99 34 98 44M124 14C122 24 121 34 122 44" stroke="#e9b632" stroke-width="2" '
             'stroke-dasharray="2 2.2" fill="none"/>')
    h.append("".join('<circle cx="%d" cy="%d" r="1.6" fill="url(#gGv)"/>' % (x, y)
                     for x, y in ((100, 22), (100, 30), (120, 22), (120, 30))))
    h.append(shape("M90 42C100 46 118 46 126 42L126 50C116 54 100 54 90 50Z", c["main"], 1.1))
    h.append(limb([(106, 50), (126, 62), (120, 92)], 15, pants))
    h.append('<path d="M115 66 127 60M118 74 124 70" stroke="#e9b632" stroke-width="1.4"/>')
    h.append(shape("M113 88H127L128 98C130 100 134 101 134 104H112Z", "#3a2014", 1.3))
    h.append('<circle cx="110" cy="101" r="2.6" fill="none" stroke="#e9b632" stroke-width="1.2"/>')
    h.append(shape("M110 90 114 104 126 104 130 90", "none", 1.6))
    hd = head(110, -16, 1.0, skin, hair, "knight", dx=3, hat="sombrero",
              hatc={"o": "#e8d6a8", "c": "#3a2a24", "e": "#f0e2c0", "b": "#d2b47a"}[s], hatc2=c["main"])
    reins = '<path d="M112 38C140 44 170 50 188 48" fill="none" stroke="#3a2014" stroke-width="1.6"/>'
    if s == "o":
        h.append(limb([(98, 12), (90, 30), (112, 38)], 11, jacket))
        h.append(hand(112, 38, skin, 5) + reins + hd)
        h.append(limb([(120, 12), (136, -6), (138, -30)], 11, jacket))
        h.append(held("o", 140, -48, 0, .4))
        h.append(hand(138, -32, skin, 5.4))
    elif s == "c":
        h.append(limb([(98, 12), (92, 30), (112, 38)], 11, jacket))
        h.append(hand(112, 38, skin, 5) + reins + hd)
        h.append(limb([(120, 12), (140, 20), (154, 10)], 11, jacket))
        h.append(held("c", 156, 8, 10, .42))
        h.append(hand(155, 10, skin, 5.2))
    elif s == "e":
        h.append(limb([(98, 12), (92, 30), (112, 38)], 11, jacket))
        h.append(hand(112, 38, skin, 5) + reins + hd)
        h.append(limb([(120, 12), (142, 2), (146, -24)], 11, jacket))
        h.append(held("e", 146, -24, 30, .78))
        h.append(hand(146, -24, skin, 5.6))
    else:
        h.append(hd)
        h.append(held("b", 116, 28, -58, .82))
        h.append(limb([(120, 12), (130, 30), (116, 30)], 11, jacket))
        h.append(hand(116, 29, skin, 5.6))
        h.append(limb([(98, 12), (96, 30), (112, 40)], 11, jacket))
        h.append(hand(112, 40, skin, 5) + reins)
    h.append(limb([(56, 100), (70, 124), (48, 140), (58, 162)], 12, "url(#coatv)"))
    if s == "e":
        h.append(limb([(150, 102), (174, 112), (172, 136)], 12, "url(#coatv)"))
        h.append('<circle cx="172" cy="139" r="6" fill="#2b211c"/>')
    else:
        h.append(limb([(150, 102), (166, 124), (158, 146)], 12, "url(#coatv)"))
        h.append('<circle cx="157" cy="149" r="6" fill="#2b211c"/>')
    h.append('<circle cx="58" cy="165" r="6" fill="#2b211c"/>')
    if s == "e":
        horse = '<g transform="translate(26 154) rotate(-8 100 160)">%s</g>' % "".join(h)
    else:
        horse = '<g transform="translate(24 150)">%s</g>' % "".join(h)
    if s in ("c", "b"):
        horse = '<g transform="translate(250 0) scale(-1 1)">%s</g>' % horse
    g.append(nopal)
    g.append(horse)
    extra = lin("coat", [(0, coat), (1, coat2)], 0, 0, 0, 1) + lin("coatv", [(0, coat), (1, coat2)], 0, 0, 0, 1)
    return court_card(s, "11", g, court_defs(s, extra))


# ------------------------------------------------------------------------------------------------- Rey
def ermine(d, spots):
    return shape(d, "#fffaf0", 1.2) + "".join(
        '<path d="M%s %sl-1.4 4h2.8Z" fill="%s"/>' % (n(x), n(y), INK) for x, y in spots)


def rey(s):
    c = COURT[s]
    skin, hair = SKIN[s], KING_HAIR[s]
    robe = c["main"] if s != "o" else "#b8322a"
    mantle = {"o": "#e3a51f", "c": "#7a1a2a", "e": "#1d3f7a", "b": "#2f6a2c"}[s]
    g = [panel_bg(s, 125, 96), tiles(300, c["main"], c["second"])]
    g.append(shape("M58 268V112C58 70 88 46 125 46 162 46 192 70 192 112V268Z", "url(#gGv)", 1.8))
    g.append(shape("M68 268V116C68 80 94 58 125 58 156 58 182 80 182 116V268Z",
                   c["second"] if s != "o" else "#1f7f86", 1.4))
    diam = "".join("M%d %dl6 8-6 8-6-8Z" % (x, y) for x in range(80, 180, 18) for y in range(70, 260, 22)
                   if (x - 125) ** 2 / 3600.0 + (y - 120) ** 2 / 4800.0 < 1.6)
    g.append('<path d="%s" fill="#fff" opacity=".14"/>' % diam)
    g.append(shape("M114 30C114 20 136 20 136 30L140 46H110Z", "url(#gGv)", 1.4))
    g.append(mini(s, 125, 34, 14))
    for x in (58, 192):
        g.append('<circle cx="%d" cy="104" r="8" fill="url(#gGv)" stroke="%s" stroke-width="1.4"/>' % (x, INK))
    g.append(shape("M96 120C72 146 64 210 64 292H186C186 210 178 146 154 120Z", mantle, 1.6))
    g.append(shape("M100 120C94 120 90 126 91 134L96 196C86 206 82 222 84 236 84 260 84 280 86 296H164C166 280 166 260 "
                   "166 236 168 222 164 206 154 196L159 134C160 126 156 120 150 120Z", robe, 1.6))
    g.append('<path d="M100 120C94 120 90 126 91 134L96 196C86 206 82 222 84 236 84 260 84 280 86 296H164C166 280 166 260 '
             '166 236 168 222 164 206 154 196L159 134C160 126 156 120 150 120Z" fill="url(#brc)"/>')
    g.append('<path d="M88 232C110 240 140 240 162 232" stroke="%s" stroke-opacity=".3" stroke-width="2" fill="none"/>' % INK)
    g.append(ermine("M118 124H132L134 296H116Z", [(122, 140), (128, 160), (121, 182), (128, 204), (122, 228), (128, 252),
                                                   (122, 276)]))
    g.append(ermine("M84 284C110 290 140 290 166 284L167 298C140 304 110 304 83 298Z",
                    [(92, 290), (106, 293), (120, 294), (134, 294), (148, 293), (160, 290)]))
    g.append(shape("M94 192C110 198 140 198 156 192L156 202C140 208 110 208 94 202Z", "url(#gGv)", 1.2))
    g.append('<circle cx="125" cy="199" r="3.4" fill="url(#gemR)" stroke="%s" stroke-width=".8"/>' % INK)
    g.append(shape("M92 304C100 296 150 296 158 304 160 312 90 312 92 304Z", c["accent"], 1.3))
    g.append(shape("M104 300C104 292 114 292 118 296L118 302H104Z", "#3a2418", 1.2))
    g.append(shape("M146 300C146 292 136 292 132 296L132 302H146Z", "#3a2418", 1.2))
    g.append(ermine("M98 118C110 112 140 112 152 118 160 124 162 134 158 140 142 136 108 136 92 140 88 134 90 124 98 118Z",
                    [(100, 126), (112, 130), (125, 127), (138, 130), (150, 126)]))
    hd = head(125, 92, 1.18, skin, hair, "king", dx={"o": 0, "c": 2, "e": -2, "b": 1.5}[s], beard=True, hat="crown")
    sl = robe
    if s == "o":
        g.append(hd)
        g.append(limb([(150, 132), (164, 170), (148, 200)], 14, sl))
        g.append(hand(148, 202, skin, 6))
        g.append(limb([(100, 132), (76, 156), (82, 126)], 14, sl))
        g.append(held("o", 82, 104, 0, .5))
        g.append(hand(82, 126, skin, 6))
    elif s == "c":
        g.append(hd)
        g.append(limb([(150, 132), (172, 166), (176, 196)], 14, sl))
        g.append(hand(176, 198, skin, 6))
        g.append(limb([(100, 132), (92, 172), (114, 180)], 14, sl))
        g.append(held("c", 120, 176, 0, .52))
        g.append(hand(114, 180, skin, 6))
    elif s == "e":
        g.append(hd)
        g.append(held("e", 172, 196, 0, 1.22))
        g.append(limb([(150, 132), (176, 160), (172, 194)], 14, sl))
        g.append(hand(172, 196, skin, 6.4))
        g.append(limb([(100, 132), (88, 172), (106, 194)], 14, sl))
        g.append(hand(106, 195, skin, 6))
    else:
        g.append(held("b", 92, 182, -24, 1.08))
        g.append(hd)
        g.append(limb([(100, 132), (80, 166), (92, 182)], 14, sl))
        g.append(hand(92, 182, skin, 6.4))
        g.append(limb([(150, 132), (164, 170), (148, 200)], 14, sl))
        g.append(hand(148, 202, skin, 6))
    return court_card(s, "12", g, court_defs(s, brocade("#ffe08a", .55)))


# ------------------------------------------------------------------------------------------------ Aces
def sparkle(x, y, r, col="#fff"):
    k = r * .28
    return '<path d="M%s %sQ%s %s %s %sQ%s %s %s %sQ%s %s %s %sQ%s %s %s %sZ" fill="%s"/>' % (
        n(x), n(y - r), n(x + k), n(y - k), n(x + r), n(y), n(x + k), n(y + k), n(x), n(y + r),
        n(x - k), n(y + k), n(x - r), n(y), n(x - k), n(y - k), n(x), n(y - r), col)


def scroll(x, y, s=1.0, flip=False, col="#c48a12"):
    """A symmetric pair of acanthus-ish scrolls centred on (x, y)."""
    one = ('<path d="M0 0C10-2 22-10 34-6 44-2 44 10 36 12 30 13 27 7 31 4M18-4C22-12 30-16 38-14" fill="none" '
           'stroke="%s" stroke-width="2.4" stroke-linecap="round"/><circle cx="31" cy="4" r="2.2" fill="%s"/>'
           '<path d="M8-2C10-8 14-10 18-10 16-6 12-3 8-2Z" fill="%s"/>' % (col, col, col))
    sy = -1 if flip else 1
    return ('<g transform="translate(%s %s) scale(%s %s)">%s<g transform="scale(-1 1)">%s</g>'
            '<path d="M0-5 4 0 0 5-4 0Z" fill="%s"/></g>' % (n(x), n(y), n(s), n(s * sy), one, one, col))


def ace_oros():
    cx, cy = 125, 175
    rays_d = []
    for i in range(32):
        a = 2 * math.pi * i / 32 - math.pi / 2
        if i % 2 == 0:
            r0, r1, da = 66, 112, math.radians(4.2)
            rays_d.append("M%s %sL%s %sL%s %sZ" % (
                n(cx + r0 * math.cos(a - da)), n(cy + r0 * math.sin(a - da)), n(cx + r1 * math.cos(a)),
                n(cy + r1 * math.sin(a)), n(cx + r0 * math.cos(a + da)), n(cy + r0 * math.sin(a + da))))
        else:
            r0, r1, da = 66, 94, math.radians(4.6)
            m = 80
            px, py = -math.sin(a), math.cos(a)
            rays_d.append("M%s %sQ%s %s %s %sQ%s %s %s %sZ" % (
                n(cx + r0 * math.cos(a - da)), n(cy + r0 * math.sin(a - da)),
                n(cx + m * math.cos(a) - 7 * px), n(cy + m * math.sin(a) - 7 * py),
                n(cx + r1 * math.cos(a)), n(cy + r1 * math.sin(a)),
                n(cx + m * math.cos(a) + 3 * px), n(cy + m * math.sin(a) + 3 * py),
                n(cx + r0 * math.cos(a + da)), n(cy + r0 * math.sin(a + da))))
    g = ['<circle cx="125" cy="175" r="118" fill="url(#aglow)"/>',
         '<path d="%s" fill="url(#arays)" stroke="%s" stroke-width="1.2" stroke-linejoin="round"/>' % ("".join(rays_d), INK)]
    beads = "".join('<circle cx="%s" cy="%s" r="2.7"/>' % (n(cx + 63 * math.cos(a)), n(cy + 63 * math.sin(a)))
                    for a in [i * math.pi / 18 for i in range(36)])
    fine = "".join("M%s %sL%s %s" % (n(cx + 40 * math.cos(a)), n(cy + 40 * math.sin(a)), n(cx + 50 * math.cos(a)),
                                     n(cy + 50 * math.sin(a))) for a in [i * math.pi / 30 for i in range(60)])
    g.append('<circle cx="125" cy="178" r="70" fill="#000" opacity=".18"/>')
    g.append('<circle cx="125" cy="175" r="70" fill="url(#oRim)" stroke="%s" stroke-width="2"/>' % INK)
    g.append('<g fill="#fff1b8" stroke="#7a4b00" stroke-width=".6">%s</g>' % beads)
    g.append('<circle cx="125" cy="175" r="57" fill="url(#oFace)" stroke="#7a4b00" stroke-width="1.6"/>')
    g.append('<path d="%s" stroke="#b07008" stroke-width="1.3"/>' % fine)
    g.append('<circle cx="125" cy="175" r="53" fill="none" stroke="#a86b08" stroke-width="1" stroke-dasharray="1 3"/>')
    g.append('<circle cx="125" cy="175" r="38" fill="url(#sunface)" stroke="#8a4f00" stroke-width="1.5"/>')
    # the sun's face
    face = ('<g fill="none" stroke="#7a3f00" stroke-width="2" stroke-linecap="round">'
            '<path d="M106 170Q112 175 118 170M132 170Q138 175 144 170"/>'
            '<path d="M104 162Q111 157 118 161M132 161Q139 157 146 162" stroke-width="1.6"/>'
            '<path d="M125 172Q129 182 124 184" stroke-width="1.6"/>'
            '<path d="M114 191Q125 199 136 191"/></g>'
            '<circle cx="107" cy="182" r="5" fill="#ef6a3a" opacity=".45"/>'
            '<circle cx="143" cy="182" r="5" fill="#ef6a3a" opacity=".45"/>'
            '<path d="M93 160A34 34 0 0 1 118 140" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="4" '
            'stroke-linecap="round"/>')
    g.append(face)
    g.append('<path d="M75 140A58 58 0 0 1 112 118" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="5" '
             'stroke-linecap="round"/>')
    g.append(scroll(125, 44, 1.25, col="#c48a12"))
    g.append(scroll(125, 306, 1.25, flip=True, col="#c48a12"))
    for x, y, r in ((62, 70, 7), (190, 66, 5), (196, 290, 7), (58, 282, 5), (36, 175, 4), (214, 175, 4)):
        g.append(sparkle(x, y, r, "#e9a92a"))
    defs = (rad("aglow", [(0, ("#ffe58a", .9)), (.55, ("#ffd25a", .35)), (1, ("#ffd25a", 0))]) +
            rad("arays", [(0, "#fff2a8"), (.55, "#ffc23a"), (1, "#f07e1a")], r=.5) +
            rad("sunface", [(0, "#fff8d6"), (.7, "#ffd65a"), (1, "#f2a52a")], cx=.45, cy=.4, r=.7) +
            grads("oRim", "oFace"))
    return card("o", "1", "".join(g), defs=defs)


def heart(x, y, s, fill="url(#gemR)"):
    return ('<path d="M0 6C-10-2-12-10-6-13-2-15 0-12 0-9 0-12 2-15 6-13 12-10 10-2 0 6Z" transform="translate(%s %s) '
            'scale(%s)" fill="%s" stroke="%s" stroke-width="%s"/>' % (n(x), n(y), n(s), fill, INK, n(1.2 / s)))


def ace_copas():
    g = ['<circle cx="125" cy="180" r="112" fill="url(#aglow)"/>', rays_ace(125, 160, "#f7b1a4")]
    # scroll handles
    for sx in (-1, 1):
        x = [125 + sx * k for k in (58, 96, 94, 74, 58, 52, 47)]
        d = "M%s 134C%s 122 %s 160 %s 172 %s 182 %s 182 %s 176" % tuple(n(v) for v in x)
        g.append('<path d="%s" fill="none" stroke="%s" stroke-width="10" stroke-linecap="round"/>' % (d, INK))
        g.append('<path d="%s" fill="none" stroke="url(#gGv)" stroke-width="6.4" stroke-linecap="round"/>' % d)
        g.append('<circle cx="%s" cy="176" r="4.6" fill="url(#gemB)" stroke="%s" stroke-width="1"/>' % (n(x[6]), INK))
    g.append('<use href="#em-c" transform="translate(125 196) scale(1.78)"/>')
    g.append(heart(125, 98, 1.7) + heart(100, 76, 1.05) + heart(151, 70, 1.2) + heart(124, 52, .75))
    g.append(scroll(125, 318, 1.1, flip=True, col="#c72b35"))
    for x, y, r in ((66, 84, 6), (188, 96, 5), (60, 250, 5), (192, 258, 6)):
        g.append(sparkle(x, y, r, "#e86a6a"))
    defs = (rad("aglow", [(0, ("#ffd6cc", .95)), (.6, ("#ffb3a3", .35)), (1, ("#ffb3a3", 0))]) +
            grads("gG", "gGv", "cBowl", "gemB", "gemG", "gemR") + emblem("c"))
    return card("c", "1", "".join(g), defs=defs)


def rays_ace(cx, cy, col, k=24):
    out = []
    for i in range(k):
        a0 = 2 * math.pi * i / k
        a1 = a0 + math.pi / k
        out.append("M%s %sL%s %sL%s %sZ" % (n(cx), n(cy), n(cx + 100 * math.cos(a0)), n(cy + 100 * math.sin(a0)),
                                            n(cx + 100 * math.cos(a1)), n(cy + 100 * math.sin(a1))))
    return '<path d="%s" fill="%s" opacity=".35"/>' % ("".join(out), col)


def laurel(cx, cy, r, a0, a1, k, side, col="url(#bLeaf)"):
    out = []
    pts = []
    for i in range(k + 1):
        a = math.radians(a0 + (a1 - a0) * i / k)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    out.append('<path d="M%s" fill="none" stroke="#5e3412" stroke-width="2" stroke-linecap="round"/>' % "L".join(
        "%s %s" % (n(x), n(y)) for x, y in pts))
    for i, (x, y) in enumerate(pts[1:], 1):
        a = math.degrees(math.radians(a0 + (a1 - a0) * i / k)) + 90 * side
        out.append(leaf(x, y, a - 30, .9, col) + leaf(x, y, a + 210 - 180 + 180 + 30, .9, col))
    return "".join(out)


def ace_espadas():
    g = ['<circle cx="125" cy="170" r="112" fill="url(#aglow)"/>', rays_ace(125, 222, "#b8cff2", 24)]
    g.append(laurel(125, 222, 62, 100, 250, 9, 1) + laurel(125, 222, 62, 80, -70, 9, -1))
    g.append('<use href="#em-e" transform="translate(125 168) scale(2.6 2.8)"/>')
    # ribbon across the blade
    rb = ("M58 132C80 120 100 140 125 128 150 116 170 136 192 124L196 146C174 158 154 138 129 150 104 162 84 142 62 154Z")
    g.append('<path d="M58 132 40 128 48 142 40 156 62 154Z" fill="#163a78" stroke="%s" stroke-width="1.4" '
             'stroke-linejoin="round"/>' % INK)
    g.append('<path d="M192 124 210 120 202 134 210 148 196 146Z" fill="#163a78" stroke="%s" stroke-width="1.4" '
             'stroke-linejoin="round"/>' % INK)
    g.append(shape(rb, "url(#ribbon)", 1.5))
    g.append('<path d="M64 140C84 130 102 148 126 137 150 126 168 144 190 133" fill="none" stroke="#fff" '
             'stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="3 3"/>')
    for x, y, r in ((64, 70, 6), (190, 74, 5), (62, 300, 5), (190, 296, 6)):
        g.append(sparkle(x, y, r, "#6f97d8"))
    defs = (rad("aglow", [(0, ("#dfeaff", .95)), (.6, ("#bcd2f5", .35)), (1, ("#bcd2f5", 0))]) +
            lin("ribbon", [(0, "#2f63b8"), (.5, "#5d8ee0"), (1, "#1f4f9e")], 0, 0, 0, 1) +
            grads("gG", "eBlade", "eGrip", "gemB", "bLeaf") + emblem("e"))
    return card("e", "1", "".join(g), defs=defs)


def blossom(x, y, s, col="#fff4f0"):
    petals = "".join('<ellipse cx="0" cy="-5" rx="3.6" ry="5" transform="rotate(%d)"/>' % (k * 72) for k in range(5))
    return ('<g transform="translate(%s %s) scale(%s)"><g fill="%s" stroke="%s" stroke-width=".8">%s</g>'
            '<circle r="2.4" fill="#f2b632" stroke="%s" stroke-width=".6"/></g>' % (n(x), n(y), n(s), col, INK, petals, INK))


def ace_bastos():
    g = ['<circle cx="125" cy="175" r="112" fill="url(#aglow)"/>', rays_ace(125, 175, "#c3e3a6", 24)]
    g.append('<use href="#em-b" transform="translate(125 172) rotate(-14) scale(2.55)"/>')
    for x, y, s, c in ((80, 102, 1.4, "#fff4f0"), (166, 86, 1.2, "#ffd6e0"), (166, 206, 1.1, "#fff4f0"),
                       (60, 128, .9, "#ffd6e0")):
        g.append(blossom(x, y, s, c))
    # red ribbon bow on the handle
    g.append(shape("M140 254C150 264 160 284 152 300L142 292C146 280 140 268 134 260Z", "#b8322a", 1.3))
    g.append(shape("M134 254C120 262 108 280 114 298L124 292C122 278 126 266 136 260Z", "#c7302f", 1.3))
    g.append(shape("M134 252C122 240 106 240 106 252 106 262 122 262 134 256Z", "#d6403a", 1.3))
    g.append(shape("M140 252C152 242 168 244 168 254 168 264 152 262 140 256Z", "#d6403a", 1.3))
    g.append('<ellipse cx="137" cy="255" rx="6" ry="5" fill="#a3242a" stroke="%s" stroke-width="1.3"/>' % INK)
    for x, y, r in ((60, 70, 6), (196, 130, 5), (62, 300, 5), (196, 300, 6)):
        g.append(sparkle(x, y, r, "#7fbf5a"))
    defs = (rad("aglow", [(0, ("#e6f6d2", .95)), (.6, ("#c7e8a8", .35)), (1, ("#c7e8a8", 0))]) +
            grads("bWood", "bLeaf") + emblem("b"))
    return card("b", "1", "".join(g), defs=defs)


ACES = {"o": ace_oros, "c": ace_copas, "e": ace_espadas, "b": ace_bastos}


# ------------------------------------------------------------------------------------------- La Reina
S["r"] = dict(ink="#a3134a", frame="#c2306a", main="#c2306a", light="#ffb3cc", dark="#6e0c34",
              bg=("#ffeaf1", "#f29bb9"), ray="#fff5f8")
GAPS["r"] = 0
MINI["r"] = ('<path d="M0 44C-30 22-42 2-34-14-26-30-6-28 0-12 6-28 26-30 34-14 42 2 30 22 0 44Z" fill="#d42d5a" '
             'stroke="%s" stroke-width="6.5" stroke-linejoin="round"/>'
             '<path d="M-22-24-26-50-12-36 0-54 12-36 26-50 22-24Z" fill="#f0b52a" stroke="%s" stroke-width="5.5" '
             'stroke-linejoin="round"/>' % (INK, INK))


def rose(x, y, s=1.0, stem=0, leaves=True):
    g = []
    if stem:
        g.append('<path d="M0 8C2 %s -3 %s 0 %s" fill="none" stroke="%s" stroke-width="4.4" stroke-linecap="round"/>'
                 '<path d="M0 8C2 %s -3 %s 0 %s" fill="none" stroke="#3f8f3a" stroke-width="2.4" stroke-linecap="round"/>'
                 % (n(stem * .4), n(stem * .7), n(stem), INK, n(stem * .4), n(stem * .7), n(stem)))
        g.append('<path d="M1 %sl4-2M-1 %sl-4-2" stroke="%s" stroke-width="1.2"/>' % (n(stem * .5), n(stem * .75), INK))
    if leaves:
        g.append(leaf(2, 10, 20, .9) + leaf(-2, 12, 150, .8))
    g.append('<path d="M-12 1C-14-9-6-14 0-12 6-14 14-9 12 1 10 11-10 11-12 1Z" fill="url(#rose)" stroke="%s" '
             'stroke-width="1.3"/>' % INK)
    g.append('<path d="M-11 2C-6 8 6 8 11 2M-8-6C-4-1 4-1 8-6" fill="none" stroke="#7a0f2a" stroke-width="1" '
             'stroke-opacity=".7"/>')
    g.append('<path d="M-5-3C-5-8 5-8 5-3 5 2-3 2-3-2-3-5 2-5 2-2" fill="none" stroke="#7a0f2a" stroke-width="1.3" '
             'stroke-linecap="round"/>')
    g.append('<path d="M-8-4C-8-8-5-10-2-10" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" '
             'stroke-linecap="round"/>')
    return '<g transform="translate(%s %s) scale(%s)">%s</g>' % (n(x), n(y), n(s), "".join(g))


def reina_card():
    skin, hair = "#e2a87c", "#3a1e14"
    gown, mantle = "#c2306a", "#6e1446"
    g = [panel_bg("r", 125, 90)]
    for x, y, s in ((44, 132, .7), (206, 118, .6), (38, 222, .55), (212, 214, .7), (196, 66, .5)):
        g.append(heart(x, y, s, "#e2557f"))
    for x, y, r in ((62, 78, 5), (186, 160, 4), (60, 180, 4), (192, 268, 5), (58, 268, 4)):
        g.append(sparkle(x, y, r, "#fff"))
    g.append(tiles(300, "#c2306a", "#e3a51f"))
    # mantle
    g.append(shape("M98 116C72 150 60 230 56 300H194C190 230 178 150 152 116Z", mantle, 1.6))
    g.append('<path d="M98 116C72 150 60 230 56 300M152 116C178 150 190 230 194 300" fill="none" stroke="url(#gGv)" '
             'stroke-width="4"/>')
    # gown: bodice and bell skirt
    sk = ("M104 118C98 120 96 126 97 134L104 182C90 210 76 260 72 300 100 308 150 308 178 300 174 260 160 210 146 182L153 134"
          "C154 126 152 120 146 118 138 124 112 124 104 118Z")
    g.append(shape(sk, gown, 1.6))
    g.append('<path d="%s" fill="url(#brc)"/>' % sk)
    g.append('<path d="M74 294C100 302 150 302 176 294" fill="none" stroke="url(#gGv)" stroke-width="5"/>')
    g.append(zigzag(80, 170, 284, 5, 8, "#ffd6e4", 1.6))
    g.append(shape("M106 176C116 182 134 182 144 176L146 186C134 192 116 192 104 186Z", "url(#gGv)", 1.2))
    g.append('<path d="M125 190C122 230 118 262 112 300M125 190C128 230 132 262 138 300" stroke="%s" stroke-opacity=".2" '
             'stroke-width="2" fill="none"/>' % INK)
    # neckline and pearls
    g.append(shape("M108 119C114 132 136 132 142 119 136 122 114 122 108 119Z", skin, 1.1))
    g.append("".join('<circle cx="%s" cy="%s" r="1.9" fill="#fffaf0" stroke="%s" stroke-width=".5"/>' % (
        n(125 + 13 * math.cos(a)), n(119 + 9 * math.sin(a)), INK) for a in [math.pi * (.15 + .07 * k) for k in range(11)]))
    g.append('<path d="M125 128l3 4-3 4-3-4Z" fill="url(#gemR)" stroke="%s" stroke-width=".6"/>' % INK)
    g.append(head(125, 92, 1.16, skin, hair, "queen", dx=-1.5, hat="qcrown"))
    # arms: left hand rests at the waist, right brings the rose to her heart
    g.append(limb([(104, 128), (90, 162), (108, 182)], 13, gown))
    g.append(hand(108, 182, skin, 5.8))
    g.append(rose(150, 142, 1.45, stem=30))
    g.append(limb([(146, 128), (170, 166), (150, 172)], 13, gown))
    g.append(hand(150, 172, skin, 6))
    for x in (102, 148):
        g.append('<circle cx="%d" cy="126" r="9" fill="%s" stroke="%s" stroke-width="1.4"/>' % (x, gown, INK))
        g.append('<path d="M%d 118V134" stroke="url(#gGv)" stroke-width="2.4"/>' % x)
    # banner
    g.append(shape("M44 302 30 296 38 310 30 324 50 320Z", "#8a1d4f", 1.3))
    g.append(shape("M206 302 220 296 212 310 220 324 200 320Z", "#8a1d4f", 1.3))
    g.append(shape("M44 300C90 292 160 292 206 300L204 322C160 314 90 314 46 322Z", "url(#banner)", 1.6))
    g.append('<text x="125" y="315.5" text-anchor="middle" font-family="Georgia, \'Times New Roman\', \'DejaVu Serif\', '
             'serif" font-size="15" font-weight="700" letter-spacing="3" fill="#fff6e0">LA REINA</text>')
    defs = (PANEL + panel_grad("r") + brocade("#ffd6e4", .4) +
            lin("banner", [(0, "#d63c78"), (.5, "#e9558a"), (1, "#b52460")], 0, 0, 0, 1) +
            grads("gGv", "gemR", "gemB", "gemG", "rose", "bLeaf"))
    return court_card("r", "R", g, defs)


# ------------------------------------------------------------------------------------------- Backs
def back(reina=False):
    if reina:
        c0, c1, gold = "#9a2560", "#4a0c2a", "#f2c45a"
    else:
        c0, c1, gold = "#8e1c2e", "#3e0812", "#f0c050"
    if reina:
        motif = ('<circle cx="11" cy="11" r="3.4" fill="#e2365e" stroke="%s" stroke-width=".6"/>'
                 '<path d="M9.4 11a1.6 1.6 0 1 1 1.6 1.6" fill="none" stroke="#7a0f2a" stroke-width=".7"/>' % gold)
    else:
        motif = ('<path d="M11 6.5C13 9 13 9 15.5 11 13 13 13 13 11 15.5 9 13 9 13 6.5 11 9 9 9 9 11 6.5Z" fill="%s" '
                 'opacity=".75"/><circle cx="11" cy="11" r="1.3" fill="%s"/>' % (gold, c1))
    pat = ('<pattern id="lat" x="4" y="10" width="22" height="22" patternUnits="userSpaceOnUse">'
           '<path d="M11 0 22 11 11 22 0 11Z" fill="none" stroke="%s" stroke-opacity=".38" stroke-width=".8"/>'
           '<circle cx="0" cy="0" r="1.6" fill="%s" opacity=".55"/><circle cx="22" cy="0" r="1.6" fill="%s" opacity=".55"/>'
           '<circle cx="0" cy="22" r="1.6" fill="%s" opacity=".55"/><circle cx="22" cy="22" r="1.6" fill="%s" opacity=".55"/>'
           '%s</pattern>' % (gold, gold, gold, gold, gold, motif))
    defs = (rad("bk", [(0, c0), (1, c1)], cx=.5, cy=.5, r=.7) + pat +
            rad("med", [(0, c0), (1, c1)], r=.6) + grads("gGv"))
    g = ['<rect width="250" height="350" rx="14" fill="url(#bk)"/>',
         '<rect x="1" y="1" width="248" height="348" rx="13" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>',
         '<rect x="9" y="9" width="232" height="332" rx="9" fill="none" stroke="%s" stroke-width="2.2"/>' % gold,
         '<rect x="15" y="15" width="220" height="320" rx="6" fill="url(#lat)" stroke="%s" stroke-width=".9"/>' % gold]
    # corner fans
    for rot in (0, 90, 180, 270):
        cx, cy = {0: (15, 15), 90: (235, 15), 180: (235, 335), 270: (15, 335)}[rot]
        g.append('<g transform="translate(%d %d) rotate(%d)"><path d="M0 0H34A34 34 0 0 1 0 34Z" fill="%s" opacity=".9"/>'
                 '<path d="M0 0H26A26 26 0 0 1 0 26Z" fill="%s"/><path d="M0 0 22 8M0 0 15 15M0 0 8 22" stroke="%s" '
                 'stroke-width="1.2"/><circle cx="6" cy="6" r="2.6" fill="%s"/></g>' % (cx, cy, rot, gold, c1, gold, gold))
    # centre medallion
    g.append('<g transform="translate(125 175)">')
    g.append('<path d="M0-74 12-58 0-50-12-58ZM0 74 12 58 0 50-12 58Z" fill="%s"/>' % gold)
    petals = "".join('<path d="M0-62C10-54 10-48 0-44-10-48-10-54 0-62Z" transform="rotate(%d)" fill="%s" opacity=".9"/>'
                     % (k * 30, gold) for k in range(12))
    g.append(petals)
    g.append('<circle r="48" fill="url(#med)" stroke="%s" stroke-width="3"/>' % gold)
    g.append('<circle r="42" fill="none" stroke="%s" stroke-width=".9" stroke-dasharray="2 2.6"/>' % gold)
    if reina:
        g.append('<g transform="translate(0 -8) scale(1.15)">%s</g>' % (
            '<path d="M-17-11-19-30-10-21-5-34 0-23 5-34 10-21 19-30 17-11Z" fill="url(#gGv)" stroke="%s" '
            'stroke-width="1.2" stroke-linejoin="round"/><path d="M-17.5-14H17.5L17-9H-17Z" fill="url(#gGv)" '
            'stroke="%s" stroke-width="1"/>' % (INK, INK)))
        g.append(rose(0, 14, 1.35))
    else:
        for k, s in enumerate(SUITS):
            a = math.radians(45 + 90 * k)
            g.append(mini(s, 33 * math.cos(a), 33 * math.sin(a), 15))
        g.append('<path d="M12-12A17 17 0 1 0 12 12" fill="none" stroke="%s" stroke-width="6" stroke-linecap="round"/>'
                 % gold)
        g.append('<path d="M12-12A17 17 0 1 0 12 12" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" '
                 'stroke-linecap="round" transform="translate(-1.5 -1.5)"/>')
        g.append('<circle cx="0" cy="0" r="2.6" fill="%s"/>' % gold)
    g.append('</g>')
    defs_extra = (grads("rose", "bLeaf") if reina else "")
    return svg("".join(g), defs=defs + defs_extra)


# ------------------------------------------------------------------------------------------- Extras
def suit_icon(s):
    return svg('<use href="#em-%s" transform="translate(50 50) scale(.96)"/>' % s,
               defs=grads(*EMBLEM_GRADS[s]) + emblem(s), vb=(100, 100))


def felt():
    body = ('<rect width="160" height="160" fill="#0f3a28"/>'
            '<path d="M0 80 80 0 160 80 80 160Z" fill="none" stroke="#f4efe3" stroke-opacity=".035" stroke-width="1"/>'
            '<path d="M0 0 160 160M160 0 0 160" stroke="#000" stroke-opacity=".05" stroke-width="1"/>'
            '<rect width="160" height="160" filter="url(#n)"/>'
            '<g fill="#f2c45a" fill-opacity=".07"><circle cx="0" cy="0" r="2"/><circle cx="160" cy="0" r="2"/>'
            '<circle cx="0" cy="160" r="2"/><circle cx="160" cy="160" r="2"/><circle cx="80" cy="80" r="2"/></g>')
    defs = ('<filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" '
            'numOctaves="3" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .1  0 0 0 0 .25  0 0 0 0 .16  '
            '0 0 0 .55 -.12"/></filter>')
    return svg(body, defs=defs, vb=(160, 160))


def stamp():
    red = "#c8202c"
    defs = ('<filter id="rough" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" '
            'baseFrequency=".045" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>'
            '<filter id="grit" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" '
            'baseFrequency=".75" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  '
            '0 0 0 7 -4.5"/></filter>'
            '<filter id="blot" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" '
            'baseFrequency=".035" numOctaves="2" seed="21"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  '
            '0 0 0 9 -5.7"/></filter>'
            '<mask id="wear" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="150">'
            '<rect width="320" height="150" fill="#fff"/><rect width="320" height="150" filter="url(#grit)"/>'
            '<rect width="320" height="150" filter="url(#blot)"/></mask>')
    body = ('<g mask="url(#wear)"><g filter="url(#rough)" transform="rotate(-7 160 75)" fill="none" stroke="%s">'
            '<rect x="22" y="28" width="276" height="94" rx="16" stroke-width="7"/>'
            '<rect x="33" y="39" width="254" height="72" rx="9" stroke-width="2.2"/>'
            '<text x="160" y="92" text-anchor="middle" fill="%s" stroke="none" font-family="Impact, \'Arial Black\', '
            '\'Helvetica Neue\', \'DejaVu Sans\', Arial, sans-serif" font-weight="900" font-size="44" letter-spacing="1.5" '
            'textLength="228" lengthAdjust="spacingAndGlyphs">¡TE OBLIGO!</text>'
            '<path d="M44 75l4-8 4 8-4 8ZM268 75l4-8 4 8-4 8Z" fill="%s" stroke="none"/></g></g>' % (red, red, red))
    return svg(body, defs=defs, vb=(320, 150))


def crown_svg():
    pts = [(-17, -11), (-19, -34), (-10, -24), (-5, -40), (0, -27), (5, -40), (10, -24), (19, -34), (17, -11)]
    g = ['<ellipse cx="60" cy="90" rx="40" ry="5" fill="#000" opacity=".2"/>',
         '<g transform="translate(60 92) scale(2.3)">',
         shape("M" + " ".join("%s %s" % (n(a), n(b)) for a, b in pts) + "Z", "url(#gGv)", .8),
         '<path d="M-10-24-5-17M10-24 5-17M0-27V-17" stroke="#9a6508" stroke-width=".6" fill="none"/>']
    for bx, by in ((-19, -36), (-5, -42), (5, -42), (19, -36)):
        g.append('<circle cx="%s" cy="%s" r="2.6" fill="#fff3b0" stroke="%s" stroke-width=".6"/>' % (n(bx), n(by), INK))
    g.append(shape("M-18-18H18L17.4-9.5H-17.4Z", "url(#gGv)", .7))
    g.append('<circle cx="0" cy="-13.8" r="2.8" fill="url(#gemR)" stroke="%s" stroke-width=".5"/>' % INK)
    g.append('<circle cx="-10" cy="-13.8" r="2" fill="url(#gemB)" stroke="%s" stroke-width=".5"/>' % INK)
    g.append('<circle cx="10" cy="-13.8" r="2" fill="url(#gemG)" stroke="%s" stroke-width=".5"/>' % INK)
    g.append('<path d="M-15-30-13-14" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>')
    g.append('</g>')
    return svg("".join(g), defs=grads("gGv", "gemR", "gemB", "gemG"), vb=(120, 100))


def petal_svg():
    body = ('<path d="M20 46C6 38 2 22 6 11 9 3 16 4 20 9 24 4 31 3 34 11 38 22 34 38 20 46Z" fill="url(#pt)" '
            'stroke="#8c0f33" stroke-opacity=".5" stroke-width=".8"/>'
            '<path d="M20 44C19 34 19 22 20 12M20 30C16 26 12 24 10 20M20 26C24 22 27 20 29 16" fill="none" '
            'stroke="#8c0f33" stroke-opacity=".3" stroke-width=".8"/>'
            '<path d="M10 14C12 9 15 9 17 12" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" '
            'stroke-linecap="round"/>')
    return svg(body, defs=rad("pt", [(0, "#ffb3c4"), (.6, "#e2365e"), (1, "#a3123e")], cx=.45, cy=.3, r=.8), vb=(40, 48))


def mini_card(x, y, rot, inner, fill=PAPER, stroke="#c48a12"):
    return ('<g transform="translate(%s %s) rotate(%s)"><rect x="-28" y="-80" width="56" height="80" rx="5" fill="#000" '
            'opacity=".25" transform="translate(2 3)"/><rect x="-28" y="-80" width="56" height="80" rx="5" fill="%s" '
            'stroke="%s" stroke-width="1.6"/>%s</g>' % (n(x), n(y), n(rot), fill, stroke, inner))


def logo_svg():
    back_inner = ('<rect x="-24" y="-76" width="48" height="72" rx="3" fill="url(#lat)" stroke="#f0c050" '
                  'stroke-width="1"/><circle cy="-40" r="9" fill="#5e0f1c" stroke="#f0c050" stroke-width="1.6"/>')
    cards_ = ('<g transform="translate(86 176) scale(1.4)">' +
              mini_card(-12, 0, -30, back_inner, fill="#8e1c2e", stroke="#f0c050") +
              mini_card(0, -3, -6, '<use href="#em-c" transform="translate(0 -40) scale(.46)"/>', stroke="#c72b35") +
              mini_card(12, 0, 18, '<use href="#em-o" transform="translate(0 -40) scale(.46)"/>') + '</g>')
    word = ('<text x="176" y="118" font-family="Georgia, \'Palatino Linotype\', Palatino, \'Book Antiqua\', '
            '\'DejaVu Serif\', serif" font-style="italic" font-weight="700" font-size="80" letter-spacing="-1" textLength="320" lengthAdjust="spacingAndGlyphs" '
            'fill="url(#wm)" stroke="%s" stroke-width="5" stroke-linejoin="round" paint-order="stroke">Conquián</text>' % INK)
    swash = ('<path d="M178 140C248 154 344 126 478 138 494 139 506 134 508 126 509 118 500 116 496 122" fill="none" '
             'stroke="%s" stroke-width="7" stroke-linecap="round"/>'
             '<path d="M178 140C248 154 344 126 478 138 494 139 506 134 508 126 509 118 500 116 496 122" fill="none" '
             'stroke="url(#wm)" stroke-width="3.4" stroke-linecap="round"/>' % INK)
    sp = sparkle(492, 56, 10, "#f2c45a") + sparkle(474, 32, 5, "#ffe08a") + sparkle(142, 48, 6, "#ffe08a")
    pat = ('<pattern id="lat" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M4 0 8 4 4 8 0 4Z" fill="none" '
           'stroke="#f0c050" stroke-opacity=".5" stroke-width=".6"/></pattern>')
    defs = (lin("wm", [(0, "#fff3b0"), (.45, "#f2c442"), (1, "#c88912")], 0, 0, 0, 1) + pat +
            grads("oRim", "oFace", "gemR", "gG", "cBowl", "gemB", "gemG") + emblem("o") + emblem("c"))
    return svg(cards_ + swash + word + sp, defs=defs, vb=(520, 190))


# ------------------------------------------------------------------------------------------- build
def all_files():
    """{relative path: text} for every art file."""
    files = {}
    for s in SUITS:
        files["cards/%s1.svg" % s] = ACES[s]()
        for r in range(2, 8):
            files["cards/%s%d.svg" % (s, r)] = pip_card(s, r)
        files["cards/%s10.svg" % s] = sota(s)
        files["cards/%s11.svg" % s] = caballo(s)
        files["cards/%s12.svg" % s] = rey(s)
    files["back.svg"] = back(False)
    files["back-reina.svg"] = back(True)
    files["reina.svg"] = reina_card()
    for s in SUITS:
        files["suit-%s.svg" % s] = suit_icon(s)
    files["felt.svg"] = felt()
    files["stamp-obligo.svg"] = stamp()
    files["crown.svg"] = crown_svg()
    files["petal.svg"] = petal_svg()
    files["logo.svg"] = logo_svg()
    return files


NAMES = {"o": "Oros", "c": "Copas", "e": "Espadas", "b": "Bastos"}
RANK_NAMES = {1: "As", 10: "Sota", 11: "Caballo", 12: "Rey"}


def preview(names):
    def fig(f, w, cap=""):
        return '<figure><img src="%s" width="%d" alt=""><figcaption>%s</figcaption></figure>' % (f, w, cap or f)

    full = []
    for s in SUITS:
        full.append('<h2>%s</h2><div class="row">%s</div>' % (NAMES[s], "".join(
            fig("cards/%s%d.svg" % (s, r), 250, "%s%d &middot; %s" % (s, r, RANK_NAMES.get(r, r))) for r in RANKS)))
    small = "".join('<div class="row small">%s</div>' % "".join(
        '<img src="cards/%s%d.svg" width="56" alt="">' % (s, r) for r in RANKS) for s in SUITS)
    hand = '<div class="hand">%s</div>' % "".join('<img src="cards/%s.svg" width="56" alt="">' % c for c in
                                                   ("o1", "o2", "o3", "c7", "c10", "e11", "e12", "b4", "b5", "b6"))
    backs = "".join(fig(f, 250) for f in ("back.svg", "back-reina.svg", "reina.svg"))
    backs_small = "".join('<img src="%s" width="56" alt="">' % f for f in ("back.svg", "back-reina.svg", "reina.svg"))
    extras = "".join(fig(f, w) for f, w in (("suit-o.svg", 64), ("suit-c.svg", 64), ("suit-e.svg", 64),
                                            ("suit-b.svg", 64), ("crown.svg", 120), ("petal.svg", 40),
                                            ("stamp-obligo.svg", 320), ("logo.svg", 520)))
    return ("""<!doctype html>
<html lang="en" data-i18n-skip>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Conquián deck: contact sheet</title>
<style>
 body{margin:0;padding:24px;background:#0f3a28 url(felt.svg);color:#f4efe3;font:15px/1.4 ui-sans-serif,system-ui,sans-serif}
 h1{font-weight:800;margin:0 0 4px} h2{font:600 13px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;
 color:#cfe0d4;margin:26px 0 10px} p{color:#cfe0d4;margin:0 0 12px}
 .row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
 .row.small{gap:6px;margin-bottom:8px}
 figure{margin:0;display:grid;gap:6px;justify-items:center}
 figcaption{font:12px ui-monospace,monospace;color:#cfe0d4}
 img{filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
 .hand{display:flex;padding:8px 0}.hand img{margin-right:-30px}
</style>
</head>
<body>
<h1><img src="logo.svg" width="360" alt="Conquián"></h1>
<p>Original art drawn in code (src/build_cards.py). Not linked from the app.</p>
<h2>56 px wide (phone hand size)</h2>
%s
<h2>A hand at 56 px, overlapped</h2>
%s
<h2>Backs and the Queen</h2>
<div class="row">%s</div>
<div class="row small" style="margin-top:10px">%s</div>
<h2>Extras</h2>
<div class="row">%s</div>
%s
</body>
</html>
""" % (small, hand, backs, backs_small, extras, "".join(full)))


def build(out, licenses=None):
    files = all_files()
    names = sorted(files)
    files["cards.json"] = json.dumps({"version": 1, "w": W, "h": H, "files": names}, indent=1) + "\n"
    files["preview.html"] = preview(names)
    for rel, text in files.items():
        p = os.path.join(out, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    if licenses:
        with open(licenses, encoding="utf-8") as f:
            lic = json.load(f)
        lic["files"] = {k: v for k, v in lic["files"].items() if not k.startswith("conquian/")}
        for rel in list(files) + ["src/build_cards.py"]:
            how = ("vector art drawn in code by %s" % GEN if rel.endswith(".svg") else
                   "generator source (stdlib Python)" if rel.endswith(".py") else
                   "local contact sheet generated by %s (not linked from the app)" % GEN if rel.endswith(".html") else
                   "spec generated by %s" % GEN)
            lic["files"]["conquian/" + rel] = {"author": AUTHOR, "how": how, "license": "CC0-1.0"}
        lic["files"] = dict(sorted(lic["files"].items()))
        with open(licenses, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(lic, indent=1, sort_keys=True) + "\n")
    return names


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    build(out, LICENSES if out == OUT else None)


if __name__ == "__main__":
    main()
