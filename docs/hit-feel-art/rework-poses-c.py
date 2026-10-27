"""Rework only dog/spitter C poses after PR #122's independent art review.

python docs/hit-feel-art/rework-poses-c.py
Original v1 images, the other 13 species and runtime files are read-only.
Pillow copies original RGBA at the logical grid; it never scales a body.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
REVIEW = 'https://github.com/xuys2025/escape-bincov/pull/122#issuecomment-6398466408'
BASE = 'aff5d48efdbaa76b499fbc70f68adcb8f43ae89a'
TARGETS = {'saltback-dog', 'sac-spitter'}
ENTRIES = json.loads((ROOT / 'assets/hit-feel/templates/sources-c.json').read_text(encoding='utf-8'))['templates']


def supported_body(idle, phase):
    """Lower the intact upper assembly onto bent legs; keep native width.

    Move existing pixels by 2/1 rows, without resampling their x or y spacing.
    Keep the original support band and the leg pixels immediately above it;
    the displaced upper legs overlap those supports instead of moving feet.
    """
    out = idle.copy()
    support = idle.getchannel('A').getbbox()[3] - 4
    last_moving_row = support - phase
    out.paste((0, 0, 0, 0), (0, 0, 32, last_moving_row))
    for y in range(last_moving_row):
        for x in range(32):
            pixel = idle.getpixel((x, y))
            if pixel[3]:
                out.putpixel((x, y + phase), pixel)
    return out


def spread_bend(im, first, last, source_bounds):
    """Copy the bend/sac clusters one pixel outward, inside source extents.

    This local pen edit at the loaded knees or lower sac keeps their volume
    when the upper assembly settles onto them. Do not narrow any scanline or
    extend/reposition the source footprint. Every sample is an existing RGBA.
    """
    for y in range(first, last):
        old = [im.getpixel((x, y)) for x in range(32)]
        active = [x for x, pixel in enumerate(old) if pixel[3]]
        if not active:
            continue
        left, right = min(active), max(active)
        start = max(source_bounds[0], left - 1)
        end = min(source_bounds[2] - 1, right + 1)
        for x in range(start, end + 1):
            source_x = left + ((x - start) * (right - left) + (end - start) // 2) // max(1, end - start)
            im.putpixel((x, y), old[source_x])


def tuck_spitter_head(im, direction):
    """Move the existing side/oblique head cluster back one native pixel.

    These authored regions refer to the hurt frame after its 2-row drop. The
    feet are outside each region; the neck connects to the unchanged trunk.
    Front/back views retain the centreline and tuck vertically with the body.
    """
    regions = {'E': (20, 32, 41), 'SE': (20, 34, 44), 'NE': (20, 24, 34)}
    if direction not in regions:
        return
    left, first, last = regions[direction]
    before = im.copy()
    im.paste((0, 0, 0, 0), (left, first, 32, last))
    for y in range(first, last):
        for x in range(left, 32):
            pixel = before.getpixel((x, y))
            if pixel[3]:
                im.putpixel((x - 1, y), pixel)


def rework(entry, idle, phase, direction):
    out = supported_body(idle, phase)
    bounds = idle.getchannel('A').getbbox()
    support = bounds[3] - 4
    if phase == 2:
        if entry['id'] == 'saltback-dog' and direction == 'SE':
            # Front-facing knees spread under the lowered shoulders/neck.
            spread_bend(out, support - 3, support, bounds)
        elif entry['id'] == 'sac-spitter':
            tuck_spitter_head(out, direction)
            # The sac settles outward between the supports, instead of
            # shrinking with the head. Its side view needs a longer belly band.
            spread_bend(out, support - (8 if direction == 'E' else 5), support, bounds)
    return out


def comparison(previews, scale):
    w, h = 32 * scale, 48 * scale
    label = 112
    slot_w = max(w + 4, 56)
    panel_w = label + 5 * slot_w + 8
    row_h = h + 28
    result = Image.new('RGB', (panel_w * 2, 44 + 5 * row_h), (24, 29, 29))
    draw = ImageDraw.Draw(result)
    draw.text((8, 6), f'C REWORK / ART ONLY / {scale}x / idle | v1 hurt | v2 hurt | v1 recovery | v2 recovery', fill=(222, 221, 201))
    for n, (entry, rows) in enumerate(previews):
        for r, (direction, frames) in enumerate(rows):
            y = 44 + r * row_h
            draw.text((n * panel_w + 4, y + 8), entry['id'], fill=(222, 221, 201))
            draw.text((n * panel_w + 4, y + 22), direction, fill=(171, 183, 177))
            for col, frame in enumerate(frames):
                x = n * panel_w + label + col * slot_w
                draw.text((x, y + 2), ['idle', 'v1 hurt', 'v2 hurt', 'v1 rec', 'v2 rec'][col], fill=(171, 183, 177))
                draw.rectangle((x, y + 20, x + w - 1, y + 20 + h - 1), fill=(43, 44, 39))
                big = frame.resize((w, h), Image.Resampling.NEAREST)
                result.paste(big, (x, y + 20), big)
    path = ROOT / f'docs/hit-feel-art/c-beast-rework-{scale}x-v2.png'
    result.save(path, optimize=True)
    return path.relative_to(ROOT).as_posix()


def main():
    v1 = json.loads((ROOT / 'assets/hit-feel/sources/editions-c-v1.json').read_text(encoding='utf-8'))
    # Freeze every original deliverable before opening any output file.
    preserved = {entry['file']: entry['sha256'] for entry in v1['sheets']}
    preserved.update({file: hashlib.sha256((ROOT / file).read_bytes()).hexdigest() for file in v1['artReviewPlates']})
    for file, expected in preserved.items():
        assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == expected, file
    sheets, previews = [], []
    for entry in ENTRIES:
        if entry['id'] not in TARGETS:
            continue
        template_path = ROOT / entry['template']
        assert hashlib.sha256(template_path.read_bytes()).hexdigest() == entry['sha256']
        sheet = Image.open(template_path).convert('RGBA')
        before = Image.open(ROOT / f"assets/hit-feel/sources/{entry['id']}-hurt-sheet-v1.png").convert('RGBA').resize((96, 240), Image.Resampling.NEAREST)
        rows = []
        for r, source in enumerate(entry['frames']):
            source_path = ROOT / source['file']
            assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source['sha256']
            idle = Image.open(source_path).convert('RGBA')
            hurt, recovery = [rework(entry, idle, phase, source['dir']) for phase in [2, 1]]
            for col, frame in enumerate([hurt, recovery], 1):
                sheet.paste(frame.resize((256, 384), Image.Resampling.NEAREST), (col * 256, r * 384))
            old_hurt, old_recovery = [before.crop((c * 32, r * 48, (c + 1) * 32, (r + 1) * 48)) for c in [1, 2]]
            rows.append((source['dir'], [idle, old_hurt, hurt, old_recovery, recovery]))
        destination = ROOT / f"assets/hit-feel/sources/{entry['id']}-hurt-sheet-v2.png"
        sheet.save(destination, optimize=True)
        sheets.append({'id': entry['id'], 'file': destination.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()})
        previews.append((entry, rows))
    selected = [next((new for new in sheets if new['id'] == old['id']), old) for old in v1['sheets']]
    plates = [comparison(previews, scale) for scale in [1, 3]]
    metadata = {'schema': 1, 'base': BASE, 'review': REVIEW, 'method': 'Only two species reworked: intact upper clusters displaced down 2/1 pixels over fixed support, no whole-body scaling; local SE dog knee spread; spitter side/oblique head tuck by 1 pixel and settling sac spread from existing RGBA. Other 13 remain accepted v1.', 'sheets': selected, 'reworkedSheets': sheets, 'preservedV1Files': preserved, 'artReviewPlates': plates}
    (ROOT / 'assets/hit-feel/sources/editions-c-v2.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for file, expected in preserved.items():
        assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == expected, file
    print('Reworked 2 sheets / 20 poses; all 15 v1 sheets and 6 v1 plates byte-identical. Other 13 species untouched.')


if __name__ == '__main__':
    main()
