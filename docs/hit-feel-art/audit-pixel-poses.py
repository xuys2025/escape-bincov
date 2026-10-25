"""Validate delivered PNGs against the art contract, independently of authoring.

python docs/hit-feel-art/audit-pixel-poses.py
Writes only pixel-audit.json; never repairs images. Exits nonzero on failures.
Requires Pillow. Runtime playback and human perception remain separate checks.
"""
import hashlib
import json
import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = json.loads((ROOT / 'assets/hit-feel/templates/sources.json').read_text())['templates']
DIRS = ['E', 'SE', 'S', 'NE', 'N']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--edition', choices=['v1', 'v2'], default='v1')
parser.add_argument('--rework', action='store_true', help='Apply the v2 review contract to v1 as a negative control')
parser.add_argument('--output', help='Repository-relative report path')
args = parser.parse_args()
rework = args.rework or args.edition == 'v2'


def equal(a, b):
    return all(c.getbbox() is None for c in ImageChops.difference(a, b).split())


def rgba_palette(im):
    return {p for p in im.getdata() if p[3]}


def changed(a, b):
    return sum(x != y for x, y in zip(a.getdata(), b.getdata()))


def centre(im, top, bottom):
    weights = [(x, im.getpixel((x, y))[3]) for y in range(top, bottom) for x in range(im.width)]
    return sum(x * a for x, a in weights) / sum(a for _, a in weights)


def outline_difference(a, b, bottom):
    return sum((a.getpixel((x, y))[3] >= 128) != (b.getpixel((x, y))[3] >= 128) for y in range(bottom) for x in range(a.width))


def enclosed_holes(im):
    """Four-neighbour flood fill from image borders, treating alpha=0 as empty."""
    w, h = im.size
    empty = {(x, y) for y in range(h) for x in range(w) if im.getpixel((x, y))[3] == 0}
    outside = {p for p in empty if p[0] in [0, w - 1] or p[1] in [0, h - 1]}
    queue = deque(outside)
    while queue:
        x, y = queue.popleft()
        for p in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]:
            if p in empty and p not in outside:
                outside.add(p)
                queue.append(p)
    return empty - outside


def alpha_centroid(im):
    return centre(im, 0, im.height)


def opaque_components(im):
    remaining = {(x, y) for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))[3] > 0}
    count = 0
    while remaining:
        count += 1
        queue = deque([remaining.pop()])
        while queue:
            x, y = queue.popleft()
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    p = (x + dx, y + dy)
                    if p in remaining:
                        remaining.remove(p)
                        queue.append(p)
    return count


report = {'schema': 1, 'method': 'Independent exact-pixel validation of saved sheets, not their authoring functions. World anchor uses the original cell origin; no per-frame recentering. Pixel movement thresholds are in logical pixels.', 'sheets': [], 'failures': []}
if rework:
    report['review'] = 'https://github.com/xuys2025/escape-bincov/pull/96#issuecomment-6379082043'
    report['edition'] = args.edition
    report['holeMethod'] = 'Four-neighbour border flood fill, alpha exactly zero; only the original lookout S head hole may follow head movement.'
    report['headMetricClarification'] = 'The review calls its metric the head front but also calls it the rightmost opaque column. Fixed SE/NE foot pixels contradict a whole-frame limit. Report both whole-frame and rows 0-23 values; do not claim final acceptance of the ambiguous metric.'
    report['wholeFrameMetricConflicts'] = []
for entry in TEMPLATES:
    id = entry['id']
    w, h = (40, 28) if id == 'creature' else (32, 48)
    file = f'assets/hit-feel/sources/{id}-hurt-sheet-pixel-{args.edition}.png'
    im = Image.open(ROOT / file).convert('RGBA')
    template = Image.open(ROOT / entry['template']).convert('RGBA')
    checks = {'canvas': im.size == template.size, 'idleColumnExact': equal(im.crop((0, 0, w * 8, h * 8 * 5)), template.crop((0, 0, w * 8, h * 8 * 5))), 'hasTrueTransparency': im.getchannel('A').histogram()[0] > 0}
    small = im.resize((w * 3, h * 5), Image.Resampling.NEAREST)
    checks['uniform8x8Blocks'] = equal(im, small.resize(im.size, Image.Resampling.NEAREST))
    baseline = Image.open(ROOT / f'assets/hit-feel/sources/{id}-hurt-sheet-pixel-v1.png').convert('RGBA')
    rows = []
    for row, direction in enumerate(DIRS):
        frames = [small.crop((col * w, row * h, (col + 1) * w, (row + 1) * h)) for col in range(3)]
        idle = frames[0]
        fixed_foot = 24 if id == 'creature' else 40 if id.startswith('raider-') else 43
        palette = rgba_palette(idle)
        top = idle.getchannel('A').getbbox()[1]
        top_band = 24 if id == 'creature' else 19
        phases = []
        for pose, expected_drop, frame in zip(['hurt', 'recovery'], [2, 1], frames[1:]):
            bbox = frame.getchannel('A').getbbox()
            torso_centre = centre(frame, 19, 33) if id != 'creature' else centre(frame, 10, 24)
            original_centre = centre(idle, 19, 33) if id != 'creature' else centre(idle, 10, 24)
            results = {
                'footBandExact': equal(frame.crop((0, fixed_foot, w, h)), idle.crop((0, fixed_foot, w, h))),
                'onlyOriginalColours': rgba_palette(frame) <= palette,
                'headOrShellTopDrop': bbox[1] - top,
                'centreShift': round(torso_centre - original_centre, 4),
                'outlineChangedPixels': outline_difference(idle, frame, top_band),
                'changedPixels': changed(idle, frame),
                'bounds': bbox,
                'visibleWithinCell': 0 < bbox[0] and bbox[2] < w and 0 < bbox[1] and bbox[3] <= h,
            }
            results['topDropCorrect'] = results['headOrShellTopDrop'] == expected_drop
            results['centreWithinOnePixel'] = abs(torso_centre - original_centre) <= 1
            results['outlineReadableDifference'] = results['outlineChangedPixels'] >= 2
            if id != 'creature':
                results['shoulderBandExact'] = equal(frame.crop((0, 19, w, 22)), idle.crop((0, 19, w, 22)))
            # Body colour changes and contours are checked separately; alpha-only
            # getbbox would miss accidental RGB changes to the locked idle column.
            required = ['footBandExact', 'onlyOriginalColours', 'visibleWithinCell', 'topDropCorrect', 'centreWithinOnePixel', 'outlineReadableDifference']
            if id != 'creature':
                required.append('shoulderBandExact')
            if rework:
                target = direction in (['E', 'SE', 'NE'] if id == 'creature' else ['S', 'N'])
                col = 1 if pose == 'hurt' else 2
                original_cell = baseline.crop((col * w * 8, row * h * 8, (col + 1) * w * 8, (row + 1) * h * 8))
                current_cell = im.crop((col * w * 8, row * h * 8, (col + 1) * w * 8, (row + 1) * h * 8))
                results['inRequestedScope'] = target
                results['unchangedOutsideRequestedScope'] = target or equal(current_cell, original_cell)
                required.append('unchangedOutsideRequestedScope')
                if target:
                    holes = enclosed_holes(frame)
                    allowed = {(x, y + expected_drop) for x, y in enclosed_holes(idle)} if id == 'raider-lookout' and direction == 'S' else enclosed_holes(idle)
                    results['enclosedHoles'] = sorted(holes)
                    results['newHoles'] = sorted(holes - allowed)
                    results['noNewHoles'] = not (holes - allowed)
                    results['fixedBottomFourRows'] = equal(frame.crop((0, h - 4, w, h)), idle.crop((0, h - 4, w, h)))
                    required += ['noNewHoles', 'fixedBottomFourRows']
                    if id != 'creature':
                        results['innerLegColumnsRemainOpaque'] = all(frame.getpixel((x, y))[3] > 0 for y in range(33, 43) for x in [15, 16] if idle.getpixel((x, y))[3] > 0)
                        results['kneeChangedPixels'] = changed(idle.crop((0, 33, w, 43)), frame.crop((0, 33, w, 43)))
                        results['kneesVisiblyEdited'] = results['kneeChangedPixels'] > 0
                        results['wholeBodyCentreShift'] = round(alpha_centroid(frame) - alpha_centroid(idle), 4)
                        results['centreWithinHalfPixel'] = abs(alpha_centroid(frame) - alpha_centroid(idle)) <= 0.5
                        required += ['innerLegColumnsRemainOpaque', 'kneesVisiblyEdited', 'centreWithinHalfPixel']
                    else:
                        results['wholeFrameRightEdge'] = bbox[2] - 1
                        results['aboveFixedFeetRightEdge'] = max(x for y in range(24) for x in range(w) if frame.getpixel((x, y))[3])
                        limit = {'E': [36, 37], 'SE': [36, 37], 'NE': [34, 35]}[direction][col - 1]
                        results['requestedRightEdgeLimit'] = limit
                        results['aboveFeetWithinRequestedLimit'] = results['aboveFixedFeetRightEdge'] <= limit
                        results['wholeFrameWithinRequestedLimit'] = results['wholeFrameRightEdge'] <= limit
                        if not results['wholeFrameWithinRequestedLimit']:
                            report['wholeFrameMetricConflicts'].append(f'{id}/{direction}/{pose}: whole-frame x={results["wholeFrameRightEdge"]} > {limit}; original fixed foot pixels must remain')
                        results['opaqueComponents'] = opaque_components(frame)
                        results['noNewIslands'] = results['opaqueComponents'] <= opaque_components(idle)
                        required += ['noNewIslands', 'aboveFeetWithinRequestedLimit']
                if target and args.edition == 'v2' and equal(current_cell, original_cell):
                    report['failures'].append(f'{id}/{direction}/{pose}: requested cell was not changed')
            for key in required:
                if not results[key]:
                    report['failures'].append(f'{id}/{direction}/{pose}: {key}')
            phases.append({'pose': pose, **results})
        recovery_less_changed = phases[1]['changedPixels'] < phases[0]['changedPixels']
        if not recovery_less_changed or equal(frames[1], frames[2]):
            report['failures'].append(f'{id}/{direction}: recovery must differ and be closer to idle')
        rows.append({'dir': direction, 'fixedFootFrom': fixed_foot, 'recoveryFewerChangedPixels': recovery_less_changed, 'phases': phases})
    for key, value in checks.items():
        if not value:
            report['failures'].append(f'{id}: {key}')
    report['sheets'].append({'id': id, 'file': file, 'sha256': hashlib.sha256((ROOT / file).read_bytes()).hexdigest(), 'checks': checks, 'rows': rows})
report['status'] = 'PASS' if not report['failures'] else 'FAIL'
if rework:
    report['reviewAcceptance'] = 'PENDING_HEAD_REGION_DEFINITION' if report['wholeFrameMetricConflicts'] else 'AWAITING_INDEPENDENT_REVIEW'
default_report = 'pixel-audit-v2.json' if args.edition == 'v2' else 'pixel-audit.json'
path = ROOT / (args.output or f'docs/hit-feel-art/{default_report}')
path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f"{report['status']}: 7 sheets / 35 directions / 70 new poses; {len(report['failures'])} failures")
if rework and report['wholeFrameMetricConflicts']:
    print(f'{len(report["wholeFrameMetricConflicts"])} whole-frame head/foot metric conflicts recorded; review acceptance remains pending.')
for failure in report['failures']:
    print(failure)
raise SystemExit(1 if report['failures'] else 0)
