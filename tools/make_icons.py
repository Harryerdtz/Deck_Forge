#!/usr/bin/env python3
"""DeckForge icon generator: pure Python PNG writer, no dependencies."""
import os
import struct
import zlib

W = H = 32

BG = (8, 10, 15, 255)
BG2 = (18, 24, 38, 255)
EDGE = (43, 53, 71, 255)
DARK = (5, 7, 12, 255)
GOLD = (242, 181, 68, 255)
GOLD_L = (255, 224, 138, 255)
GOLD_D = (168, 116, 31, 255)
RED = (209, 58, 69, 255)
RED_L = (255, 98, 85, 255)
RED_D = (143, 36, 48, 255)
STEEL = (185, 197, 216, 255)
STEEL_D = (70, 84, 110, 255)


def build_icon(maskable=False):
    px = [[BG for _ in range(W)] for _ in range(H)]
    # inner panel with cut corners
    for y in range(H):
        for x in range(W):
            cut = (x < 2 and y < 2) or (x > 29 and y < 2) or (x < 2 and y > 29) or (x > 29 and y > 29)
            if cut:
                px[y][x] = BG
                continue
            # subtle checker / vignette
            if (x + y) % 8 == 0:
                px[y][x] = BG2
            if x < 3 or y < 3 or x > 28 or y > 28:
                px[y][x] = EDGE
    # red glow diamond behind the sword
    for y in range(H):
        for x in range(W):
            d = abs(x - 16) + abs(y - 17)
            if d < 10 and 6 < y:
                px[y][x] = (28, 14, 20, 255)
            if d < 7 and 7 < y:
                px[y][x] = (48, 18, 25, 255)
    # sword outline
    blade = []
    for y in range(4, 20):
        blade.extend([(13, y), (18, y)])
    for x in range(9, 23):
        blade.extend([(x, 20), (x, 22)])
    for y in range(23, 28):
        blade.extend([(13, y), (18, y)])
    for x, y in blade:
        if 0 <= x < W and 0 <= y < H:
            px[y][x] = DARK
    # blade
    for y in range(4, 20):
        for x in range(14, 18):
            px[y][x] = GOLD
        px[y][14] = GOLD_D
        px[y][17] = GOLD_D
        if y < 18:
            px[y][15] = GOLD_L
            px[y][16] = GOLD
    # tip
    px[3][15] = DARK
    px[3][16] = DARK
    px[2][15] = DARK
    px[2][16] = DARK
    px[3][15] = GOLD_L
    px[3][16] = GOLD_L
    # crossguard
    for x in range(9, 23):
        for y in range(20, 23):
            px[y][x] = GOLD_D
        px[20][x] = DARK
        px[21][x] = GOLD
        px[22][x] = DARK
    for x in (9, 22):
        px[20][x] = DARK
        px[21][x] = DARK
        px[22][x] = DARK
    # grip
    for y in range(23, 27):
        for x in range(14, 18):
            px[y][x] = (122, 74, 50, 255)
        px[y][14] = DARK
        px[y][17] = DARK
        px[y][15] = (176, 106, 58, 255)
    # pommel gem
    for y in range(27, 30):
        for x in range(12, 20):
            px[y][x] = DARK
    for y in range(27, 29):
        for x in range(13, 19):
            px[y][x] = RED
    px[27][14] = RED_L
    px[27][15] = RED_L
    px[28][15] = RED_D
    # small sparks
    for x, y in ((25, 6), (26, 7), (6, 8), (7, 9), (25, 26), (6, 25)):
        px[y][x] = GOLD
    if maskable:
        # keep a clean safe margin without the outer frame
        for y in range(H):
            for x in range(W):
                if x < 2 or y < 2 or x > 29 or y > 29:
                    px[y][x] = BG
    return px


def write_png(path, pixels, size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        sy = y * H // size
        for x in range(size):
            sx = x * W // size
            raw.extend(pixels[sy][sx])

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "icons")
    os.makedirs(out, exist_ok=True)
    icon = build_icon(False)
    maskable = build_icon(True)
    write_png(os.path.join(out, "icon-192.png"), icon, 192)
    write_png(os.path.join(out, "icon-512.png"), icon, 512)
    write_png(os.path.join(out, "icon-maskable-512.png"), maskable, 512)
    write_png(os.path.join(out, "apple-touch-icon.png"), icon, 180)
    write_png(os.path.join(out, "icon-32.png"), icon, 32)
    print("icons written to", out)


if __name__ == "__main__":
    main()
