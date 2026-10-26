#!/usr/bin/env python3
"""批量压缩图片，用于把截图/渲染图体积降到适合提交仓库或网页加载的大小。

用法示例:
    python3 scripts/compress-image.py reports/game/menu.png
    python3 scripts/compress-image.py reports/game/*.jpg --target-kb 120 --out-dir /tmp/imgs
    python3 scripts/compress-image.py shots/a.png shots/b.png --format jpeg --max-width 1280 --in-place
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image

EXT = {"webp": ".webp", "jpeg": ".jpg", "png": ".png"}
MODE = {"webp": "RGBA", "png": "RGBA", "jpeg": "RGB"}


def load(path: Path, max_width: int | None) -> Image.Image:
    img = Image.open(path)
    img.load()
    if img.mode not in ("RGB", "RGBA", "L"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    if max_width and img.width > max_width:
        height = round(img.height * max_width / img.width)
        img = img.resize((max_width, height), Image.LANCZOS)
    return img


def prepare(img: Image.Image, fmt: str, colors: int | None) -> Image.Image:
    if fmt == "jpeg" and img.mode != "RGB":
        # JPEG 不支持透明，铺白底避免出现黑块
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        return bg
    if fmt == "png" and colors:
        return img.convert("RGBA").quantize(colors=colors, method=Image.FASTOCTREE)
    return img


def encode(img: Image.Image, fmt: str, quality: int, colors: int | None) -> bytes:
    buf = io.BytesIO()
    if fmt == "png":
        img.save(buf, "PNG", optimize=True)
    elif fmt == "webp":
        img.save(buf, "WEBP", quality=quality, method=6)
    else:
        img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=2)
    return buf.getvalue()


def compress(img: Image.Image, fmt: str, quality: int, target_kb: int | None) -> bytes:
    data = encode(img, fmt, quality, None)
    if not target_kb or fmt == "png":
        return data
    # 二分搜索能装进目标体积的最高质量，保住画质
    lo, hi, best = 20, quality, data
    if len(data) > target_kb * 1024:
        while lo <= hi:
            mid = (lo + hi) // 2
            candidate = encode(img, fmt, mid, None)
            if len(candidate) <= target_kb * 1024:
                best, lo = candidate, mid + 1
            else:
                hi = mid - 1
    return best


def main() -> int:
    parser = argparse.ArgumentParser(description="压缩图片到 WebP / JPEG / PNG")
    parser.add_argument("inputs", nargs="+", type=Path, help="输入图片")
    parser.add_argument("--format", choices=EXT, default="webp", help="输出格式（默认 webp）")
    parser.add_argument("--quality", type=int, default=82, help="质量 1-100（默认 82，png 忽略）")
    parser.add_argument("--max-width", type=int, default=1920, help="最大宽度，0 表示不缩放")
    parser.add_argument("--target-kb", type=int, default=0, help="目标体积 KB，0 表示不限制")
    parser.add_argument("--colors", type=int, default=0, help="PNG 调色板颜色数，0 表示不量化")
    parser.add_argument("--out-dir", type=Path, help="输出目录（默认与源文件同目录）")
    parser.add_argument("--in-place", action="store_true", help="覆盖源文件")
    parser.add_argument("--suffix", default="-min", help="输出文件名后缀")
    parser.add_argument("--force", action="store_true", help="即使输出更大也写入")
    args = parser.parse_args()

    out_dir = args.out_dir
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)

    failed = 0
    for src in args.inputs:
        if not src.is_file():
            print(f"跳过（不存在）: {src}", file=sys.stderr)
            failed += 1
            continue
        before = src.stat().st_size
        img = load(src, args.max_width or None)
        img = prepare(img, args.format, args.colors or None)
        data = compress(img, args.format, args.quality, args.target_kb or None)

        if len(data) >= before and not args.force:
            print(f"保留原图 {src} ({before / 1024:.0f} KB)，压缩后反而更大")
            continue

        if args.in_place:
            # 转格式时同步换扩展名，避免把 webp 数据写进 .png 文件
            dest = src if src.suffix.lower() == EXT[args.format] else src.with_suffix(EXT[args.format])
            if dest != src and dest.exists() and not args.force:
                print(f"跳过 {src.name}：目标 {dest.name} 已存在，用 --force 覆盖", file=sys.stderr)
                failed += 1
                continue
        else:
            base = out_dir if out_dir else src.parent
            dest = base / f"{src.stem}{args.suffix}{EXT[args.format]}"
        dest.write_bytes(data)
        if args.in_place and dest != src:
            src.unlink()
        print(
            f"{src.name} → {dest.name}  "
            f"{before / 1024:.0f} KB → {len(data) / 1024:.0f} KB "
            f"(-{(1 - len(data) / before) * 100:.0f}%)  {img.width}x{img.height}"
        )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
