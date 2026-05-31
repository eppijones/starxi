#!/usr/bin/env python3
"""Composite all nation figurines into one 21:9 group photo — no overlaps, all visible."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parent / "AllNationsCharachters"
OUT = Path(__file__).resolve().parent / "group_photo.png"

# 21:9 @ 4K (Nano Banana Pro)
CANVAS_W, CANVAS_H = 5376, 2304
BG = (0, 0, 0)

MARGIN = 40
GAP = 8
CELL_PAD = 0.92


def divisors(n: int) -> list[int]:
    out = []
    d = 1
    while d * d <= n:
        if n % d == 0:
            out.append(d)
            if d != n // d:
                out.append(n // d)
        d += 1
    return sorted(out)


def trim_alpha(img: Image.Image) -> Image.Image:
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def cell_geometry(cols: int, rows: int) -> tuple[float, float, int, int]:
    usable_w = CANVAS_W - 2 * MARGIN
    usable_h = CANVAS_H - 2 * MARGIN
    cell_w = (usable_w - GAP * (cols - 1)) / cols
    cell_h = (usable_h - GAP * (rows - 1)) / rows
    inner_w = int(cell_w * CELL_PAD)
    inner_h = int(cell_h * CELL_PAD)
    return cell_w, cell_h, inner_w, inner_h


def min_fit_scale(sizes: list[tuple[int, int]], inner_w: int, inner_h: int) -> float:
    """Smallest uniform scale so every (w,h) fits inside inner_w×inner_h."""
    scales = [min(inner_w / w, inner_h / h) for w, h in sizes]
    return min(scales)


def pick_grid(sizes: list[tuple[int, int]], count: int) -> tuple[int, int]:
    best_scale = -1.0
    best_cols, best_rows = 16, 6
    for cols in divisors(count):
        rows = count // cols
        if cols * rows != count:
            continue
        _, _, inner_w, inner_h = cell_geometry(cols, rows)
        scale = min_fit_scale(sizes, inner_w, inner_h)
        if scale > best_scale:
            best_scale = scale
            best_cols, best_rows = cols, rows
    return best_cols, best_rows


def main() -> None:
    files = sorted(p for p in SRC.glob("*.png") if not p.name.startswith("."))
    if not files:
        raise SystemExit(f"No PNGs found in {SRC}")

    trimmed = [trim_alpha(Image.open(p).convert("RGBA")) for p in files]
    sizes = [im.size for im in trimmed]

    cols, rows = pick_grid(sizes, len(files))
    cell_w, cell_h, inner_w, inner_h = cell_geometry(cols, rows)

    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), BG)

    for index, img in enumerate(trimmed):
        row = index // cols
        col = index % cols

        scale = min(inner_w / img.width, inner_h / img.height)
        new_w = max(1, int(img.width * scale))
        new_h = max(1, int(img.height * scale))
        img = img.resize((new_w, new_h), Image.LANCZOS)

        cell_x = MARGIN + col * (cell_w + GAP)
        cell_y = MARGIN + row * (cell_h + GAP)
        x = int(cell_x + (cell_w - new_w) / 2)
        y = int(cell_y + cell_h - new_h)

        canvas.paste(img, (x, y), img)

    canvas.save(OUT, "PNG", optimize=True)
    print(
        f"Saved {OUT} ({CANVAS_W}×{CANVAS_H}, 21:9, {len(files)} figures, "
        f"grid {cols}×{rows}, cell ~{cell_w:.0f}×{cell_h:.0f}px, "
        f"max slot {inner_w}×{inner_h}px)"
    )


if __name__ == "__main__":
    main()
