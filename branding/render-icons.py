#!/usr/bin/env python3
# Renders branding/logo.svg into the PNG and .icns files the build uses.
#
# macOS only: QuickLook does the SVG rendering, sips the resizing and
# iconutil the .icns. The output is checked in, so you only need to run this
# after changing the logo:
#
#   python3 branding/render-icons.py

import math
import shutil
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "icons"
SIZE = 1024
# Must match the rounded square in logo.svg
BOX = (80, 80, 944, 944)
RADIUS = 200


def read_png(path):
    data = path.read_bytes()
    pos = 8
    chunks = {}
    idat = b""
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if kind == b"IDAT":
            idat += body
        else:
            chunks.setdefault(kind, body)
        pos += 12 + length
    width, height, depth, color = struct.unpack(">IIBB", chunks[b"IHDR"][:10])
    assert depth == 8 and color in (2, 6), "expected 8-bit RGB(A)"
    bpp = 4 if color == 6 else 3
    raw = zlib.decompress(idat)
    stride = width * bpp
    rows = []
    prev = bytearray(stride)
    i = 0
    for _ in range(height):
        f = raw[i]
        line = bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[x] = (line[x] + pred) & 255
        rows.append(line)
        prev = line
    return width, height, bpp, rows


def write_png(path, width, height, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)

    def chunk(kind, body):
        return (struct.pack(">I", len(body)) + kind + body +
                struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF))

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" +
        chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) +
        chunk(b"IDAT", zlib.compress(raw, 9)) +
        chunk(b"IEND", b""))


def coverage(x, y):
    # How much of the pixel at (x, y) is inside the rounded square, 0..1.
    x0, y0, x1, y1 = BOX
    cx = min(max(x + 0.5, x0 + RADIUS), x1 - RADIUS)
    cy = min(max(y + 0.5, y0 + RADIUS), y1 - RADIUS)
    if x0 <= x + 0.5 <= x1 and y0 <= y + 0.5 <= y1 and (
            x0 + RADIUS <= x + 0.5 <= x1 - RADIUS or
            y0 + RADIUS <= y + 0.5 <= y1 - RADIUS):
        edge = min(x + 0.5 - x0, x1 - x - 0.5, y + 0.5 - y0, y1 - y - 0.5)
    else:
        edge = RADIUS - math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    return max(0.0, min(1.0, edge + 0.5))


def main():
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        subprocess.run(["qlmanage", "-t", "-s", str(SIZE), "-o", tmp,
                        ROOT / "logo.svg"], check=True, capture_output=True)
        width, height, bpp, rows = read_png(tmp / "logo.svg.png")
        assert width == SIZE and height == SIZE

        # QuickLook paints a white background, cut the icon shape back out.
        out_rows = []
        for y, row in enumerate(rows):
            line = bytearray(width * 4)
            for x in range(width):
                r, g, b = row[x * bpp:x * bpp + 3]
                line[x * 4:x * 4 + 4] = bytes((r, g, b, round(255 * coverage(x, y))))
            out_rows.append(line)
        master = tmp / "master.png"
        write_png(master, width, height, out_rows)

        def resize(size, dest):
            subprocess.run(["sips", "-z", str(size), str(size), master,
                            "--out", dest], check=True, capture_output=True)

        for size in (16, 32, 48, 64, 128, 256):
            resize(size, OUT / f"icon{size}.png")
        resize(192, OUT / "about-logo.png")
        resize(384, OUT / "about-logo@2x.png")

        iconset = tmp / "act.iconset"
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            resize(size, iconset / f"icon_{size}x{size}.png")
            resize(size * 2, iconset / f"icon_{size}x{size}@2x.png")
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o",
                        OUT / "act.icns"], check=True)
        shutil.copy(OUT / "icon256.png", ROOT / "logo.png")

    print(f"icons written to {OUT}")


if __name__ == "__main__":
    main()
