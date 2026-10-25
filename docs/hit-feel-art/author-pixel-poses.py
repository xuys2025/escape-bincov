"""Author separate, anchored pixel editions after the user's explicit approval.

Input is the unchanged template's idle column at its native logical grid.
image_gen sources remain unmodified pose references. This is a part-based
redraw, not a crop/recenter/resize of the rejected generated sheets.
Run from the repository root: python docs/hit-feel-art/author-pixel-poses.py
Requires Pillow. Does not export runtime assets or change their manifest.
"""
import hashlib
import json
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = json.loads((ROOT / 'assets/hit-feel/templates/sources.json').read_text())['templates']
DIRS = ['E', 'SE', 'S', 'NE', 'N']
CLEAR = (0, 0, 0, 0)
PLANS = {
    'scav': {'headEnd': 17, 'torsoRows': [22, 33], 'recoveryTorsoRows': [25, 29], 'kneeRows': [36, 41], 'recoveryKneeRows': [38, 39], 'fixedFootFrom': 43},
    'salt': {'headEnd': 17, 'torsoRows': [22, 33], 'recoveryTorsoRows': [25, 29], 'kneeRows': [36, 41], 'recoveryKneeRows': [38, 39], 'fixedFootFrom': 43},
    'elite': {'headEnd': 16, 'torsoRows': [24, 29], 'recoveryTorsoRows': [26, 27], 'kneeRows': [37, 39], 'recoveryKneeRows': [38, 39], 'fixedFootFrom': 43},
    'raider-melee': {'headEnd': 17, 'torsoRows': [22, 32], 'recoveryTorsoRows': [25, 28], 'kneeRows': [35, 39], 'recoveryKneeRows': [37, 38], 'fixedFootFrom': 40},
    'raider-gunner': {'headEnd': 17, 'torsoRows': [22, 30], 'recoveryTorsoRows': [25, 28], 'kneeRows': [35, 39], 'recoveryKneeRows': [37, 38], 'fixedFootFrom': 40},
    'raider-lookout': {'headEnd': 17, 'torsoRows': [22, 31], 'recoveryTorsoRows': [25, 28], 'kneeRows': [35, 39], 'recoveryKneeRows': [37, 38], 'fixedFootFrom': 40},
}


def squeeze_row(im, y, amount=1):
    """Contract clusters symmetrically within their existing row; no new colours."""
    old = [im.getpixel((x, y)) for x in range(im.width)]
    active = [x for x, p in enumerate(old) if p[3]]
    if not active:
        return
    left, right = min(active), max(active)
    if right - left < 4:
        return
    # Inverse, integer-only mapping fills the contracted silhouette without holes.
    for x in range(im.width):
        source = left + (x - left - amount) * (right - left) // max(1, right - left - amount * 2)
        im.putpixel((x, y), old[source] if left + amount <= x <= right - amount else CLEAR)


def humanoid(id, idle, direction, phase):
    plan = PLANS[id]
    out = idle.copy()
    head_end = plan['headEnd']
    # Independent head/hat/hood layer: 2 px down for hurt, 1 px for recovery.
    # The shoulder attachment band at rows 19-21 and x axis are never translated.
    for y in range(head_end):
        for x in range(32):
            out.putpixel((x, y), CLEAR)
    for y in range(head_end):
        for x in range(32):
            p = idle.getpixel((x, y))
            if p[3]:
                out.putpixel((x, y + phase), p)
    torso_rows = plan['torsoRows' if phase == 2 else 'recoveryTorsoRows']
    for y in range(*torso_rows):
        squeeze_row(out, y)
    knee_rows = plan['kneeRows' if phase == 2 else 'recoveryKneeRows']
    for y in range(*knee_rows):
        pixels = [idle.getpixel((x, y)) for x in range(32)]
        for x in range(32):
            out.putpixel((x, y), CLEAR)
        for x, p in enumerate(pixels):
            if not p[3]:
                continue
            # Forward knee flex in profile, outward knee flex in front/back views.
            dx = (1 if x >= 16 else -1) if direction in ['S', 'N'] else 1
            out.putpixel((x + dx, y), p)
    return out


def creature(idle, phase):
    out = idle.copy()
    # The lower support band stays byte-identical. The shell contracts down and
    # inward above it, with no frame translation or independently re-centred feet.
    top = idle.getchannel('A').getbbox()[1]
    bottom = 24
    for y in range(bottom):
        for x in range(40):
            out.putpixel((x, y), CLEAR)
    for y in range(top + phase, bottom):
        sy = top + (y - top - phase) * (bottom - top - 1) // max(1, bottom - top - phase - 1)
        for x in range(40):
            out.putpixel((x, y), idle.getpixel((x, sy)))
        # Hurt contracts the shell by one pixel at each side. Recovery contracts
        # only the upper ridge, leaving the lower body halfway back to idle.
        if y > top + phase and (phase == 2 or y < top + 6):
            squeeze_row(out, y)
    return out


def joined_knees(id, idle, pose, direction, phase):
    """Front/back flex is drawn with knee shading, keeping the idle leg mask."""
    out = pose.copy()
    first, last = PLANS[id]['kneeRows']
    fixed_foot = PLANS[id]['fixedFootFrom']
    out.paste(idle.crop((0, 33, 32, fixed_foot)), (0, 33))
    for left, right in [(0, 16), (16, 32)]:
        colours = {}
        for y in range(33, fixed_foot):
            for x in range(left, right):
                p = idle.getpixel((x, y))
                if p[3]:
                    colours.setdefault(p[3], set()).add(p)
        for alpha, palette in colours.items():
            colours[alpha] = sorted(palette, key=lambda p: 299 * p[0] + 587 * p[1] + 114 * p[2])
        # Patella highlight followed by a crease for S; the crease comes first
        # at the back of the knee for N. Recovery retains only the softer crease.
        rows = [first, min(first + 1, last - 1), last - 1] if phase == 2 else [first + (last - first) // 2]
        for i, y in enumerate(dict.fromkeys(rows)):
            active = [x for x in range(left, right) if idle.getpixel((x, y))[3]]
            if not active:
                continue
            # Keep the side outline and its exact alpha. Edit the broad inner
            # trouser clusters, not boots or the central seam's occupancy.
            for x in active[1:-1] or active:
                p = idle.getpixel((x, y))
                palette = colours[p[3]]
                light = (i < 2) if direction == 'S' else (i == 2)
                quantile = (0.75 if light else 0.2) if phase == 2 else 0.35
                out.putpixel((x, y), palette[round((len(palette) - 1) * quantile)])
    return out


def tucked_creature_head(pose, phase):
    """Pull the right-facing head and upper front limb under the fixed shell.

    Work only above the fixed support band. Move the connected head/upper-leg
    clusters left by 2/1 logical pixels; do not trim a bounding box or move feet.
    Shell ridge rows 0-11 and the bottom four rows are kept verbatim.
    """
    out = pose.copy()
    first_x, first_y, foot_y = 26, 12, 24
    for y in range(first_y, foot_y):
        for x in range(first_x, 40):
            out.putpixel((x, y), CLEAR)
    for y in range(first_y, foot_y):
        for x in range(first_x, 40):
            p = pose.getpixel((x, y))
            if p[3]:
                out.putpixel((x - phase, y), p)
    return out


def main(edition='v1'):
    metadata = {'schema': 1, 'method': 'User-authorized part-based edits on the native logical grid, followed by exact 8x nearest-neighbour enlargement. Original generated sources preserved.', 'rowOrder': DIRS, 'columnOrder': ['idle', 'hurt', 'recovery'], 'plans': PLANS, 'sheets': []}
    previews = []
    for entry in TEMPLATES:
        id = entry['id']
        w, h = (40, 28) if id == 'creature' else (32, 48)
        template = Image.open(ROOT / entry['template']).convert('RGBA')
        baseline_file = ROOT / f'assets/hit-feel/sources/{id}-hurt-sheet-pixel-v1.png'
        sheet = template.copy() if edition == 'v1' else Image.open(baseline_file).convert('RGBA')
        logical = []
        for row, direction in enumerate(DIRS):
            idle = template.crop((0, row * h * 8, w * 8, (row + 1) * h * 8)).resize((w, h), Image.Resampling.NEAREST)
            if edition == 'v1':
                hurt, recovery = [creature(idle, phase) if id == 'creature' else humanoid(id, idle, direction, phase) for phase in [2, 1]]
            else:
                hurt, recovery = [sheet.crop((col * w * 8, row * h * 8, (col + 1) * w * 8, (row + 1) * h * 8)).resize((w, h), Image.Resampling.NEAREST) for col in [1, 2]]
                if id != 'creature' and direction in ['S', 'N']:
                    hurt, recovery = [joined_knees(id, idle, pose, direction, phase) for pose, phase in [(hurt, 2), (recovery, 1)]]
                elif id == 'creature' and direction in ['E', 'SE', 'NE']:
                    hurt, recovery = [tucked_creature_head(pose, phase) for pose, phase in [(hurt, 2), (recovery, 1)]]
            for col, frame in enumerate([hurt, recovery], 1):
                sheet.paste(frame.resize((w * 8, h * 8), Image.Resampling.NEAREST), (col * w * 8, row * h * 8))
            logical.append([idle, hurt, recovery])
        destination = ROOT / f'assets/hit-feel/sources/{id}-hurt-sheet-pixel-{edition}.png'
        sheet.save(destination, optimize=True)
        metadata['sheets'].append({'id': id, 'template': entry['template'], 'file': destination.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'width': sheet.width, 'height': sheet.height, 'fixedFootFrom': 24 if id == 'creature' else PLANS[id]['fixedFootFrom']})
        if edition == 'v2':
            metadata['sheets'][-1]['baseFile'] = baseline_file.relative_to(ROOT).as_posix()
            metadata['sheets'][-1]['baseSha256'] = hashlib.sha256(baseline_file.read_bytes()).hexdigest()
        previews.append((id, logical))
    if edition == 'v2':
        metadata['revision'] = 'Rework of 24 human S/N knee cells and 6 creature E/SE/NE head/upper-limb cells only; all other cells preserved from pixel-v1.'
        metadata['review'] = 'https://github.com/xuys2025/escape-bincov/pull/96#issuecomment-6379082043'
        metadata['humanEdit'] = 'S/N only: keep the standing lower-body alpha mask, use original trouser colours for patella/crease shading; head, shoulders and feet unchanged from v1.'
        metadata['creatureEdit'] = 'E/SE/NE only: move connected head and upper-front-limb pixels at x>=26, 12<=y<24 left 2/1 pixels; shell ridge and support feet unchanged from v1.'
        metadata['headMetricDefinitionPending'] = True
    (ROOT / f'assets/hit-feel/sources/pixel-editions-{edition}.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    suffix = '' if edition == 'v1' else '-v2'
    # QA plates and animation are explicitly labelled art previews, not game UI.
    for group, selection in [('a', previews[:4]), ('b', previews[4:])]:
        scale, panel_w, panel_h = 3, 390, 234
        plate = Image.new('RGB', (len(selection) * panel_w, 5 * panel_h + 24), (24, 34, 34))
        draw = ImageDraw.Draw(plate)
        draw.text((8, 5), 'ART PREVIEW / native pixels at 3x / idle | hurt | recovery / fixed frame origin', fill=(220, 225, 209))
        for n, (id, rows) in enumerate(selection):
            for r, frames in enumerate(rows):
                x, y = n * panel_w, 24 + r * panel_h
                draw.text((x + 8, y + 4), f'{id} {DIRS[r]}', fill=(220, 225, 209))
                for c, frame in enumerate(frames):
                    enlarged = frame.resize((frame.width * scale, frame.height * scale), Image.Resampling.NEAREST)
                    plate.paste(enlarged, (x + c * 126 + 12, y + 78 + (48 - frame.height) * scale), enlarged)
                    # 1x copies provide a separate native-size readability check.
                    plate.paste(frame, (x + c * 126 + 44, y + 22 + (48 - frame.height)), frame)
        plate.save(ROOT / f'docs/hit-feel-art/pixel-preview-{group}{suffix}.png')
    animation = []
    for phase in [0, 1, 2, 0]:
        preview = Image.new('RGB', (7 * 164, 5 * 206 + 28), (24, 34, 34))
        draw = ImageDraw.Draw(preview)
        draw.text((8, 5), f'ART PREVIEW / {metadata["columnOrder"][phase]} / fixed feet / timing for review only', fill=(220, 225, 209))
        for n, (id, rows) in enumerate(previews):
            for r, frames in enumerate(rows):
                frame = frames[phase]
                draw.text((n * 164 + 4, r * 206 + 28), f'{id} {DIRS[r]}', fill=(220, 225, 209))
                enlarged = frame.resize((frame.width * 4, frame.height * 4), Image.Resampling.NEAREST)
                preview.paste(enlarged, (n * 164 + (164 - frame.width * 4) // 2, r * 206 + 44 + (48 - frame.height) * 4), enlarged)
        animation.append(preview)
    animation[0].save(ROOT / f'docs/hit-feel-art/pixel-preview{suffix}.gif', save_all=True, append_images=animation[1:], duration=[600, 240, 240, 300], loop=0, optimize=False, disposal=2)
    if edition == 'v2':
        examples = [('scav', 'S'), ('elite', 'N'), ('raider-melee', 'S'), ('creature', 'E'), ('creature', 'SE'), ('creature', 'NE')]
        plate = Image.new('RGB', (920, 6 * 224 + 32), (24, 34, 34))
        draw = ImageDraw.Draw(plate)
        draw.text((8, 5), 'REWORK ART PREVIEW / idle | v1 hurt | v2 hurt | v1 recovery | v2 recovery', fill=(220, 225, 209))
        current = dict(previews)
        for n, (id, direction) in enumerate(examples):
            r = DIRS.index(direction)
            frames = current[id][r]
            w, h = frames[0].size
            base = Image.open(ROOT / f'assets/hit-feel/sources/{id}-hurt-sheet-pixel-v1.png').convert('RGBA').resize((w * 3, h * 5), Image.Resampling.NEAREST)
            before = [base.crop((c * w, r * h, (c + 1) * w, (r + 1) * h)) for c in [1, 2]]
            draw.text((8, 32 + n * 224), f'{id} {direction}', fill=(220, 225, 209))
            for c, frame in enumerate([frames[0], before[0], frames[1], before[1], frames[2]]):
                enlarged = frame.resize((w * 4, h * 4), Image.Resampling.NEAREST)
                plate.paste(enlarged, (c * 184 + (184 - w * 4) // 2, 56 + n * 224 + (48 - h) * 4), enlarged)
        plate.save(ROOT / 'docs/hit-feel-art/pixel-rework-comparison-v2.png')
    print(f'Authored 7 {edition} pixel sheets, metadata, 2 review plates and 1 preview GIF; originals unchanged.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--edition', choices=['v1', 'v2'], default='v1')
    main(parser.parse_args().edition)
