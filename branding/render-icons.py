#!/usr/bin/env python3
# Builds every icon the build needs from branding/logo-source.png.
#
# macOS only (sips and iconutil). The output is checked in, so you only need
# to run this after changing the logo:
#
#   python3 branding/render-icons.py
#
# A bigger source image (1024px) gives sharper large icons.

import base64
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "logo-source.png"
OUT = ROOT / "icons"


def resize(size, dest, source=SOURCE):
    subprocess.run(["sips", "-z", str(size), str(size), source, "--out", dest],
                   check=True, capture_output=True)


def mac_master(dest):
    """The logo on Apple's icon grid: macOS icons leave a margin around the
    artwork (824 of 1024 pixels), a full bleed logo looks too big in the
    Dock next to everything else."""
    resize(824, dest)
    subprocess.run(["sips", "-p", "1024", "1024", dest, "--out", dest],
                   check=True, capture_output=True)


def main():
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 64, 128, 256):
        resize(size, OUT / f"icon{size}.png")
    resize(192, OUT / "about-logo.png")
    resize(384, OUT / "about-logo@2x.png")
    shutil.copy(OUT / "icon256.png", ROOT / "logo.png")

    with tempfile.TemporaryDirectory() as tmp:
        master = Path(tmp) / "mac-1024.png"
        mac_master(master)
        iconset = Path(tmp) / "act.iconset"
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            resize(size, iconset / f"icon_{size}x{size}.png", master)
            resize(size * 2, iconset / f"icon_{size}x{size}@2x.png", master)
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o",
                        OUT / "act.icns"], check=True)

    # Firefox wants an SVG for the about dialog, wrap the PNG in one.
    data = base64.b64encode((OUT / "about-logo@2x.png").read_bytes()).decode()
    (ROOT / "logo.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 384" '
        'width="384" height="384">'
        f'<image width="384" height="384" href="data:image/png;base64,{data}"/>'
        "</svg>\n")

    print(f"icons written to {OUT}")


if __name__ == "__main__":
    main()
