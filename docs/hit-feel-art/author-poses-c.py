"""Group C native-grid pixel edits required by TASK-C (Pillow, no canvas).

Run from any directory: python docs/hit-feel-art/author-poses-c.py
Only creates the C source sheets and art review plates; never runtime assets.
All sampled pixels keep their original, unpremultiplied RGBA tuple.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ENTRIES = json.loads((ROOT / 'assets/hit-feel/templates/sources-c.json').read_text(encoding='utf-8'))['templates']
CLEAR = (0, 0, 0, 0)
DIRS = ['E', 'SE', 'S', 'NE', 'N']
HEAVY = {'raider-boss', 'mercenary-assault', 'mercenary-support', 'blockade-sergeant', 'salt-hulk'}


def contract_row(im, y, amount=1):
    """Copy an integer interval inward; do not blend/recolour edge pixels."""
    old = [im.getpixel((x, y)) for x in range(32)]
    active = [x for x, p in enumerate(old) if p[3]]
    if not active:
        return
    left, right = min(active), max(active)
    if right - left < 2 * amount + 3:
        return
    for x in range(32):
        if left + amount <= x <= right - amount:
            sx = left + (x - left - amount) * (right - left) // (right - left - 2 * amount)
            im.putpixel((x, y), old[sx])
        else:
            im.putpixel((x, y), CLEAR)


def human(entry, idle, phase):
    out = idle.copy()
    armed = entry['group'] == 'armed'
    heavy = entry['id'] in HEAVY
    # Translate the connected head/hat cluster, not the entire frame. Retain
    # the neck underneath; rows 19/20 always come directly from the idle frame.
    head_end = 17
    out.paste(CLEAR, (0, 0, 32, head_end))
    for y in range(head_end):
        for x in range(32):
            pixel = idle.getpixel((x, y))
            if pixel[3]:
                out.putpixel((x, y + phase), pixel)
    # Armour gets a short, firm contraction; loose clothing has a longer
    # contraction. Recovery releases most of the torso and keeps the head tuck.
    torso = (23, 30) if heavy else (21 if armed else 19, 34)
    if phase == 1:
        torso = (26, 29) if heavy else (25, 30)
    for y in range(*torso):
        contract_row(out, y)
    # Flex connected trouser/knee clusters by copying whole rows, with no
    # sideways split between the pelvis and legs. Boots and support stay fixed.
    first, last = (35, 40) if heavy else (33, 41)
    if phase == 1:
        first += 2
        last -= 1
    for y in range(first, last):
        sy = max(first - 1, y - 1)
        out.paste(idle.crop((0, sy, 32, sy + 1)), (0, y))
    if armed:
        out.paste(idle.crop((0, 19, 32, 21)), (0, 19))
    foot_from = idle.getchannel('A').getbbox()[3] - 4
    out.paste(idle.crop((0, foot_from, 32, 48)), (0, foot_from))
    return out


def beast(entry, idle, phase):
    out = idle.copy()
    top = idle.getchannel('A').getbbox()[1]
    foot_from = idle.getchannel('A').getbbox()[3] - 4
    out.paste(CLEAR, (0, 0, 32, foot_from))
    # Shell/back/sac down 2/1 px, with the lower body returning to the exact
    # support band. Each scanline is a copy of one original scanline.
    for y in range(top + phase, foot_from):
        denominator = foot_from - top - phase - 1
        sy = top + ((y - top - phase) * (foot_from - top - 1) + denominator // 2) // denominator
        out.paste(idle.crop((0, sy, 32, sy + 1)), (0, y))
        if entry['id'] == 'tidal-crab':
            # Retract claws/upper legs towards the compressed shell.
            squeeze = phase == 2 or y < top + 6
        elif entry['id'] == 'saltback-dog':
            # Keep the load-bearing lower legs broad, head/back tuck above.
            squeeze = y < foot_from - 3 and (phase == 2 or y < top + 5)
        else:
            # The soft sac contracts further than the head and support legs.
            squeeze = y < foot_from - 2 and (phase == 2 or y < top + 6)
        if squeeze and y > top + phase:
            contract_row(out, y, 2 if entry['id'] == 'sac-spitter' and phase == 2 else 1)
    # Head and neck remain one connected interval. The inward scanline mapping
    # tucks the snout with the body rather than cutting it off at a fixed x.
    return out


def plate(selection, group, scale):
    # One character per row, all five directions left to right. Each triplet
    # is idle | hurt | recovery, always at the same original cell origin.
    frame_w, frame_h = 32 * scale, 48 * scale
    triplet_w = frame_w * 3 + 12
    row_h = frame_h + 28
    label_w = 166
    im = Image.new('RGB', (label_w + triplet_w * 5, 44 + len(selection) * row_h), (24, 29, 29))
    draw = ImageDraw.Draw(im)
    draw.text((8, 6), f'GROUP C / ART REVIEW ONLY / {scale}x nearest / idle | hurt | recovery / E SE S NE N', fill=(222, 221, 201))
    for n, (entry, rows) in enumerate(selection):
        y = 44 + n * row_h
        draw.text((8, y + 12), entry['id'], fill=(222, 221, 201))
        for r, frames in enumerate(rows):
            x = label_w + r * triplet_w
            draw.text((x, y), DIRS[r], fill=(171, 183, 177))
            for c, frame in enumerate(frames):
                xx, yy = x + c * frame_w, y + 20
                draw.rectangle((xx, yy, xx + frame_w - 1, yy + frame_h - 1), fill=(43, 44, 39))
                resized = frame.resize((frame_w, frame_h), Image.Resampling.NEAREST)
                im.paste(resized, (xx, yy), resized)
    path = ROOT / f'docs/hit-feel-art/c-{group}-{scale}x-v1.png'
    im.save(path, optimize=True)
    return path.relative_to(ROOT).as_posix()


def main():
    previews, sheets = [], []
    for entry in ENTRIES:
        template_path = ROOT / entry['template']
        assert hashlib.sha256(template_path.read_bytes()).hexdigest() == entry['sha256']
        sheet = Image.open(template_path).convert('RGBA')
        rows = []
        for r, source in enumerate(entry['frames']):
            source_path = ROOT / source['file']
            assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source['sha256']
            idle = Image.open(source_path).convert('RGBA')
            phases = [beast(entry, idle, phase) if entry['group'] == 'beast' else human(entry, idle, phase) for phase in [2, 1]]
            for col, frame in enumerate(phases, 1):
                sheet.paste(frame.resize((256, 384), Image.Resampling.NEAREST), (col * 256, r * 384))
            rows.append([idle, *phases])
        destination = ROOT / f"assets/hit-feel/sources/{entry['id']}-hurt-sheet-v1.png"
        sheet.save(destination, optimize=True)
        sheets.append({'id': entry['id'], 'file': destination.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()})
        previews.append((entry, rows))
    plates = [plate([p for p in previews if p[0]['group'] == group], group, scale) for group in ['armed', 'unarmed', 'beast'] for scale in [1, 3]]
    metadata = {'schema': 1, 'method': 'TASK-C exact native-grid RGBA pixel copies, head/torso/knee edits and species-specific contractions; Pillow direct PNG, no canvas, no new colours, no whole-frame recentering.', 'baseMain': 'dfa1199b29efd2628a8029d750f80156a1b5051d', 'templateIndex': 'assets/hit-feel/templates/sources-c.json', 'rows': DIRS, 'columns': ['idle', 'hurt', 'recovery'], 'sheets': sheets, 'artReviewPlates': plates}
    (ROOT / 'assets/hit-feel/sources/editions-c-v1.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Authored 15 C sheets / 150 new poses and six 1x/3x review plates; runtime unchanged.')


if __name__ == '__main__':
    main()
