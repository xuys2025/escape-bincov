"""Read-only, independent saved-PNG checks for TASK-C. Requires Pillow.

python docs/hit-feel-art/audit-poses-c.py
No authoring imports or repairs. Report includes centre measurements rather
than silently recentering asymmetric source art to make an absolute test pass.
"""
import hashlib
import json
import argparse
import subprocess
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ENTRIES = json.loads((ROOT / 'assets/hit-feel/templates/sources-c.json').read_text(encoding='utf-8'))['templates']
REWORKED = {'saltback-dog', 'sac-spitter'}
REVIEW = 'https://github.com/xuys2025/escape-bincov/pull/122#issuecomment-6398466408'
V1_HEAD = 'aff5d48efdbaa76b499fbc70f68adcb8f43ae89a'


def exact(a, b):
    # RGBA getbbox() alone can miss RGB changes when alpha is unchanged.
    return a.size == b.size and a.tobytes() == b.tobytes()


def centroid(im):
    samples = [(x, im.getpixel((x, y))[3]) for y in range(48) for x in range(32)]
    return sum(x * alpha for x, alpha in samples) / sum(alpha for _, alpha in samples)


def components(im):
    active = {(x, y) for y in range(48) for x in range(32) if im.getpixel((x, y))[3]}
    count = 0
    while active:
        count += 1
        queue = deque([active.pop()])
        while queue:
            x, y = queue.popleft()
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    p = (x + dx, y + dy)
                    if p in active:
                        active.remove(p)
                        queue.append(p)
    return count


def holes(im):
    empty = {(x, y) for y in range(48) for x in range(32) if not im.getpixel((x, y))[3]}
    exterior = {p for p in empty if p[0] in [0, 31] or p[1] in [0, 47]}
    queue = deque(exterior)
    while queue:
        x, y = queue.popleft()
        for p in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]:
            if p in empty and p not in exterior:
                exterior.add(p)
                queue.append(p)
    return empty - exterior


def pose_checks(idle, pose, phase, armed):
    before = idle.getchannel('A').getbbox()
    after = pose.getchannel('A').getbbox()
    foot_from = before[3] - 4
    palette = set(idle.getdata())
    original_holes = holes(idle)
    allowed_holes = original_holes | {(x, y + phase) for x, y in original_holes if y < 17}
    checks = {
        'onlyOriginalRgba': set(pose.getdata()) <= palette,
        'topDropExact': after is not None and after[1] - before[1] == phase,
        'lowestFourContourRowsExact': exact(idle.crop((0, foot_from, 32, 48)), pose.crop((0, foot_from, 32, 48))),
        'shoulderRows19And20Exact': not armed or exact(idle.crop((0, 19, 32, 21)), pose.crop((0, 19, 32, 21))),
        'insideCell': after is not None and 0 <= after[0] < after[2] <= 32 and 0 <= after[1] < after[3] <= 48,
        'noNewBorderContact': all(not pose.getpixel((x, y))[3] or idle.getpixel((x, y))[3] for x in [0, 31] for y in range(48)),
        'centreShiftWithinOne': abs(centroid(pose) - centroid(idle)) <= 1,
        'trueTransparentBackground': pose.getpixel((0, 0)) == (0, 0, 0, 0),
        'noNewOpaqueComponents': components(pose) <= components(idle),
        'noMoreEnclosedHoles': len(holes(pose)) <= len(holes(idle)),
        'noNewHolesExceptMovedOriginalHead': not (holes(pose) - allowed_holes),
    }
    return checks


def geometry(idle, pose):
    before, after = [im.getchannel('A').getbbox() for im in [idle, pose]]
    measures = {}
    for key, threshold in [('visiblePixelArea', 1), ('solidPixelArea', 128)]:
        original = sum(p[3] >= threshold for p in idle.getdata())
        current = sum(p[3] >= threshold for p in pose.getdata())
        measures[key] = {'idle': original, 'pose': current, 'ratio': current / original}
    original_mass = sum(p[3] for p in idle.getdata())
    mass = sum(p[3] for p in pose.getdata())
    measures['alphaMass'] = {'idle': original_mass, 'pose': mass, 'ratio': mass / original_mass}
    measures['idleWidth'] = before[2] - before[0]
    measures['poseWidth'] = after[2] - after[0]
    return measures


def size_checks(measures):
    return {
        'widthLossAtMostOne': measures['poseWidth'] >= measures['idleWidth'] - 1,
        'visibleAreaRetainedAtLeast90Percent': measures['visiblePixelArea']['pose'] * 10 >= measures['visiblePixelArea']['idle'] * 9,
        'solidAreaRetainedAtLeast90Percent': measures['solidPixelArea']['pose'] * 10 >= measures['solidPixelArea']['idle'] * 9,
        'alphaMassRetainedAtLeast90Percent': measures['alphaMass']['pose'] * 10 >= measures['alphaMass']['idle'] * 9,
    }


def main(edition='v1'):
    report = {'schema': 1, 'templateMain': '974a3a8d1ad2a7662c3a828226295d6c9b31eb64', 'authoringBase': 'dfa1199b29efd2628a8029d750f80156a1b5051d', 'method': 'Independent RGBA checks on saved 8x PNGs, all 75 current runtime sources and 15 template hashes. Fixed contour foot band uses source bbox bottom - 4, not blindly canvas rows 44-47.', 'sheets': [], 'failures': [], 'sourceCentreExceptions': [], 'negativeControls': []}
    sample = None
    for entry in ENTRIES:
        id = entry['id']
        version = 'v2' if edition == 'v2' and id in REWORKED else 'v1'
        path = ROOT / f'assets/hit-feel/sources/{id}-hurt-sheet-{version}.png'
        sheet = Image.open(path).convert('RGBA')
        template_path = ROOT / entry['template']
        template = Image.open(template_path).convert('RGBA')
        small = sheet.resize((96, 240), Image.Resampling.NEAREST)
        checks = {
            'canvas768x1920': sheet.size == (768, 1920),
            'templateHashCurrent': hashlib.sha256(template_path.read_bytes()).hexdigest() == entry['sha256'],
            'idleColumnExactIncludingTransparentRgb': exact(sheet.crop((0, 0, 256, 1920)), template.crop((0, 0, 256, 1920))),
            'uniform8x8Blocks': exact(sheet, small.resize(sheet.size, Image.Resampling.NEAREST)),
        }
        rows = []
        for row, frame in enumerate(entry['frames']):
            original_path = ROOT / frame['file']
            idle = Image.open(original_path).convert('RGBA')
            original_top = idle.getchannel('A').getbbox()[1]
            runtime_hash_current = hashlib.sha256(original_path.read_bytes()).hexdigest() == frame['sha256']
            exact_runtime_idle = exact(idle, small.crop((0, row * 48, 32, (row + 1) * 48)))
            if not runtime_hash_current or not exact_runtime_idle:
                report['failures'].append(f"{id}/{frame['dir']}: runtime source/hash mismatch")
            idle_centre = centroid(idle)
            if not 15 <= idle_centre <= 17:
                report['sourceCentreExceptions'].append({'id': id, 'dir': frame['dir'], 'sourceAlphaCentroidX': round(idle_centre, 4), 'sourceBbox': idle.getchannel('A').getbbox()})
            phases = []
            for col, (phase, name) in enumerate([(2, 'hurt'), (1, 'recovery')], 1):
                pose = small.crop((col * 32, row * 48, (col + 1) * 32, (row + 1) * 48))
                required = pose_checks(idle, pose, phase, entry['group'] == 'armed')
                shape = geometry(idle, pose) if edition == 'v2' and id in REWORKED else None
                if shape:
                    required.update(size_checks(shape))
                failures = [key for key, result in required.items() if not result]
                report['failures'].extend(f"{id}/{frame['dir']}/{name}: {key}" for key in failures)
                phases.append({'phase': name, 'checks': required, 'top': pose.getchannel('A').getbbox()[1], 'sourceTop': original_top, 'footBandFrom': idle.getchannel('A').getbbox()[3] - 4, 'centroidX': round(centroid(pose), 4), 'centreShift': round(centroid(pose) - idle_centre, 4), 'changedLogicalPixels': sum(a != b for a, b in zip(idle.getdata(), pose.getdata())), 'opaqueComponents': components(pose), 'sourceOpaqueComponents': components(idle), 'holes': sorted(holes(pose)), 'sourceHoles': sorted(holes(idle))})
                if shape:
                    phases[-1]['geometry'] = shape
                if sample is None and entry['group'] == 'armed' and phase == 2:
                    sample = (idle.copy(), pose.copy())
            closer = phases[1]['changedLogicalPixels'] < phases[0]['changedLogicalPixels']
            if not closer:
                report['failures'].append(f"{id}/{frame['dir']}: recovery not closer than hurt")
            rows.append({'dir': frame['dir'], 'runtimeHashCurrent': runtime_hash_current, 'runtimeIdleRgbaExact': exact_runtime_idle, 'sourceCentroidX': round(idle_centre, 4), 'recoveryCloserToIdle': closer, 'phases': phases})
        report['failures'].extend(f'{id}: {key}' for key, result in checks.items() if not result)
        report['sheets'].append({'id': id, 'file': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size, 'checks': checks, 'rows': rows})

    # Corrupt copies in memory, never the delivered PNGs. Ensure checks reject
    # same-alpha RGB drift, off-grid export, forbidden colours and locked bands.
    idle, pose = sample
    pixel = next((x, y) for y in range(48) for x in range(32) if idle.getpixel((x, y))[3])
    drifted = idle.copy()
    r, g, b, a = drifted.getpixel(pixel)
    drifted.putpixel(pixel, ((r + 1) % 256, g, b, a))
    report['negativeControls'].append({'case': 'idleRgbChangedAlphaIdentical', 'rejected': not exact(idle, drifted)})
    expanded = pose.resize((256, 384), Image.Resampling.NEAREST)
    expanded.putpixel((0, 0), (1, 2, 3, 4))
    roundtrip = expanded.resize((32, 48), Image.Resampling.NEAREST).resize((256, 384), Image.Resampling.NEAREST)
    report['negativeControls'].append({'case': 'nonuniform8x8Block', 'rejected': not exact(expanded, roundtrip)})
    for name, expected in [('newRgba', 'onlyOriginalRgba'), ('wrongTop', 'topDropExact'), ('footDrift', 'lowestFourContourRowsExact'), ('shoulderDrift', 'shoulderRows19And20Exact'), ('borderPixel', 'noNewBorderContact')]:
        bad = pose.copy()
        if name == 'newRgba':
            bad.putpixel((16, 28), (1, 2, 3, 255))
        elif name == 'wrongTop':
            bad = idle.copy()
        elif name == 'footDrift':
            y = idle.getchannel('A').getbbox()[3] - 1
            x = next(x for x in range(32) if idle.getpixel((x, y))[3])
            bad.putpixel((x, y), (0, 0, 0, 0))
        elif name == 'shoulderDrift':
            x = next(x for x in range(32) if idle.getpixel((x, 19))[3])
            bad.putpixel((x, 19), (0, 0, 0, 0))
        else:
            bad.putpixel((0, 28), idle.getpixel(pixel))
        report['negativeControls'].append({'case': name, 'rejected': not pose_checks(idle, bad, 2, True)[expected]})
    for negative in report['negativeControls']:
        if not negative['rejected']:
            report['failures'].append('Invalid negative control: ' + negative['case'])
    report['pixelStatus'] = 'PASS' if not report['failures'] else 'FAIL'
    report['reviewStatus'] = 'DRAFT_AWAITING_INDEPENDENT_ART_AND_SOURCE_CENTRE_REVIEW'
    report['centreInterpretation'] = 'Anchor remains (16,48); no global translation. Alpha-centroid shift <= 1 is tested. Absolute alpha-centroid 16+/-1 is NOT claimed: original templates already violate it, especially blockade-patrol. Cell anchor, anatomical centre and alpha centroid differ. Independent reviewer must confirm the intended centre metric; neither source columns nor locked foot/shoulder pixels were altered to conceal this.'
    if edition == 'v2':
        report['authoringBase'] = V1_HEAD
        report['review'] = REVIEW
        report['reviewStatus'] = '13_SPECIES_ACCEPTED_AWAITING_TWO_SPECIES_V2_VISUAL_RECHECK'
        report['centreInterpretation'] = 'Independent review accepted the relative criterion: horizontal centroid shift from the same-direction idle frame <= 1 logical pixel. This is the existing centreShiftWithinOne check. Source absolute-centre exceptions are diagnostics only, not a pending acceptance condition.'
        original = json.loads((ROOT / 'assets/hit-feel/sources/editions-c-v1.json').read_text(encoding='utf-8'))
        paths = [s['file'] for s in original['sheets']] + original['artReviewPlates'] + ['assets/hit-feel/sources/editions-c-v1.json', 'docs/hit-feel-art/c-audit-v1.json']
        report['preservedV1Files'] = []
        for file in paths:
            baseline = subprocess.check_output(['git', 'show', f'{V1_HEAD}:{file}'], cwd=ROOT)
            current = (ROOT / file).read_bytes()
            png = file.endswith('.png')
            # Git stores these JSONs as LF, while the Windows checkout has
            # CRLF. PNG preservation is always raw bytes, never normalized.
            same = baseline == current if png else baseline.replace(b'\r\n', b'\n') == current.replace(b'\r\n', b'\n')
            report['preservedV1Files'].append({'file': file, 'unchanged': same, 'comparison': 'exact PNG bytes' if png else 'Git text with CRLF normalized to LF', 'sha256': hashlib.sha256(current).hexdigest()})
            if not same:
                report['failures'].append('Original v1 file changed: ' + file)
        report['rejectedOriginalV1Hurt'] = []
        for entry in [e for e in ENTRIES if e['id'] in REWORKED]:
            old = Image.open(ROOT / f"assets/hit-feel/sources/{entry['id']}-hurt-sheet-v1.png").convert('RGBA').resize((96, 240), Image.Resampling.NEAREST)
            for row, source in enumerate(entry['frames']):
                idle = Image.open(ROOT / source['file']).convert('RGBA')
                pose = old.crop((32, row * 48, 64, (row + 1) * 48))
                checks = size_checks(geometry(idle, pose))
                rejected = not all(checks.values())
                report['rejectedOriginalV1Hurt'].append({'id': entry['id'], 'dir': source['dir'], 'rejected': rejected, 'geometry': geometry(idle, pose), 'checks': checks})
                if not rejected:
                    report['failures'].append(f"Original undersized v1 negative control not rejected: {entry['id']}/{source['dir']}")
        report['pixelStatus'] = 'PASS' if not report['failures'] else 'FAIL'
    destination = ROOT / f'docs/hit-feel-art/c-audit-{edition}.json'
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"{report['pixelStatus']}: 15 sheets / 75 directions / 150 poses; {len(report['failures'])} failures; {len(report['sourceCentreExceptions'])} pre-existing source centroid exceptions; {sum(n['rejected'] for n in report['negativeControls'])}/7 negative controls rejected")
    if edition == 'v2':
        print(f"V2 size checks: 20 poses; 21 original PNGs byte-identical, 2 original JSONs Git-text identical; {sum(n['rejected'] for n in report['rejectedOriginalV1Hurt'])}/10 original undersized hurt poses rejected")
    for failure in report['failures']:
        print(failure)
    raise SystemExit(bool(report['failures']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--edition', choices=['v1', 'v2'], default='v1')
    main(parser.parse_args().edition)
