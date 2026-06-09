#!/usr/bin/env python3
"""Compose the 1200x630 Open Graph share card (brand/og-card.png) — a landscape,
landing-style card: vibrant pitch-green field, ✦XI lockup + STAR XI wordmark on
the left, a 3D nation character on the right. Matches the launch reels aesthetic."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = "/Users/espenhorne/DEV/espenhorne/STARXI"
ANTON = ROOT + "/social/launch-2026/01_inputs/fonts/Anton-Regular.ttf"
INTER = ROOT + "/social/launch-2026/01_inputs/fonts/Inter-Variable.ttf"
HERO = ROOT + "/social/launch-2026/04_reels/frames/frame_hero_bra.png"
FIG = ROOT + "/social/launch-2026/01_inputs/figures/Brazil_M.png"
MARK = ROOT + "/brand/star-xi-gold.png"
OUT = ROOT + "/brand/og-card.png"

W, H = 1200, 630
LIME = (198, 242, 78)
GOLD = (233, 196, 90)
WHITE = (255, 255, 255)

def inter(size, weight=400):
    f = ImageFont.truetype(INTER, size)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    return f

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# --- sample the field green from the launch hero so the brand matches exactly ---
hero = Image.open(HERO).convert("RGB")
top = hero.getpixel((40, 240)); bot = hero.getpixel((40, 1500))
topC = tuple(min(255, int(c * 1.10)) for c in top)
botC = tuple(int(c * 0.82) for c in bot)

# --- background: vertical green gradient ---
base = Image.new("RGB", (W, H))
px = base.load()
for y in range(H):
    row = lerp(topC, botC, y / H)
    for x in range(W):
        px[x, y] = row
base = base.convert("RGBA")

# --- soft lime glow, top-center (the landing's stadium-light feel) ---
glow = Image.new("RGBA", (W, H), (200, 248, 130, 0))
m = Image.new("L", (W, H), 0)
ImageDraw.Draw(m).ellipse([W * 0.12, -H * 0.62, W * 0.88, H * 0.5], fill=64)
glow.putalpha(m.filter(ImageFilter.GaussianBlur(110)))
base = Image.alpha_composite(base, glow)

# --- bottom vignette for text contrast ---
vig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
vd = ImageDraw.Draw(vig)
for y in range(H):
    a = int(120 * max(0, (y - H * 0.45) / (H * 0.55)))
    vd.line([(0, y), (W, y)], fill=(3, 22, 12, a))
base = Image.alpha_composite(base, vig)

# --- character on the right, anchored to the bottom ---
fig = Image.open(FIG).convert("RGBA")
fh = 612; fw = int(fig.width * fh / fig.height)
fig = fig.resize((fw, fh), Image.LANCZOS)
fx = W - fw + 36; fy = H - fh + 18
# soft contact shadow under the feet
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(sh).ellipse([fx + fw * 0.12, H - 54, fx + fw * 0.92, H - 8], fill=(0, 0, 0, 150))
base = Image.alpha_composite(base, sh.filter(ImageFilter.GaussianBlur(16)))
base.alpha_composite(fig, (fx, fy))

d = ImageDraw.Draw(base)
LX = 76

# --- gold ✦XI mark, top-left ---
mark = Image.open(MARK).convert("RGBA")
mh = 66; mw = int(mark.width * mh / mark.height)
mark = mark.resize((mw, mh), Image.LANCZOS)
base.alpha_composite(mark, (LX, 64))
d = ImageDraw.Draw(base)

# --- eyebrow ---
eb = inter(22, 800)
d.text((LX + mw + 16, 84), "FAN-MADE FANTASY", font=eb, fill=LIME)

# --- STAR XI wordmark: white STAR + lime XI ---
big = ImageFont.truetype(ANTON, 132)
d.text((LX, 150), "STAR ", font=big, fill=WHITE)
sw = d.textlength("STAR ", font=big)
d.text((LX + sw, 150), "XI", font=big, fill=LIME)

# --- WORLD CUP 2026 (tracked) ---
wc = ImageFont.truetype(ANTON, 44)
x = LX; ytxt = 312
for ch in "WORLD CUP 2026":
    d.text((x, ytxt), ch, font=wc, fill=GOLD)
    x += d.textlength(ch, font=wc) + 5

# --- tagline ---
tg = inter(27, 500)
d.text((LX, 392), "Pick your nation. Draft your dream XI.", font=tg, fill=(255, 255, 255, 235))
d.text((LX, 428), "Call every score on the Road to the Final.", font=tg, fill=(255, 255, 255, 235))

# --- url chip ---
url = inter(28, 800)
d.text((LX, 506), "starxi.io", font=url, fill=LIME)

base.convert("RGB").save(OUT, "PNG", optimize=True)
print("wrote", OUT, base.size)
