"""Read-only audit of image_gen deliveries; does not write or repair any PNG.

Run from repository root: python docs/hit-feel-art/audit-sources.py
Requires Pillow. JSON output is an art delivery report, not a runtime manifest.
"""
import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
REFERENCES = json.loads((ROOT / 'assets/hit-feel/templates/sources.json').read_text())
ROWS = ['E', 'SE', 'S', 'NE', 'N']


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git_bytes(ref, file):
    return subprocess.check_output(['git', 'show', f'{ref}:{file}'], cwd=ROOT)


report = {'schema': 1, 'method': 'Read-only Pillow inspection; nearest-neighbour resampling is in memory for comparison only. No PNG is modified.', 'referenceCommits': {ref: subprocess.check_output(['git', 'rev-parse', ref], cwd=ROOT, text=True).strip() for ref in ['origin/main', 'origin/feat/enemy-foundation']}, 'templates': []}
for entry in REFERENCES['templates']:
    id = entry['id']
    template = Image.open(ROOT / entry['template']).convert('RGBA')
    logical = (40, 28) if id == 'creature' else (32, 48)
    current_ref = 'origin/main' if entry['group'] == 'A' else 'origin/feat/enemy-foundation'
    refs = [{**f, 'matchesCurrentRef': sha256(git_bytes(current_ref, f['file'])) == f['sha256']} for f in entry['frames']]
    deliveries = []
    for source in sorted((ROOT / 'assets/hit-feel/sources').glob(f'{id}-hurt-sheet-v*.png')):
        im = Image.open(source).convert('RGBA')
        w, h = im.size
        hist = im.getchannel('A').histogram()
        cells = []
        for row, direction in enumerate(ROWS):
            frames = []
            for col in range(3):
                rect = (round(col * w / 3), round(row * h / 5), round((col + 1) * w / 3), round((row + 1) * h / 5))
                cell = im.crop(rect).resize(logical, Image.Resampling.NEAREST)
                frames.append(cell)
            original = template.crop((0, row * logical[1] * 8, logical[0] * 8, (row + 1) * logical[1] * 8)).resize(logical, Image.Resampling.NEAREST)
            # Compare all RGBA channels explicitly (RGBA getbbox can hide RGB-only differences).
            idle_equal = all(channel.getbbox() is None for channel in ImageChops.difference(frames[0], original).split())
            cells.append({'dir': direction, 'occupiedColumns': [f.getchannel('A').getbbox() is not None for f in frames], 'idleMatchesTemplateAfterNearestDownsample': idle_equal, 'alphaBoundsAtLogicalSize': [f.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox() for f in frames]})
        deliveries.append({'file': source.relative_to(ROOT).as_posix(), 'sha256': sha256(source.read_bytes()), 'bytes': source.stat().st_size, 'width': w, 'height': h, 'templateWidth': template.width, 'templateHeight': template.height, 'exactCanvas': im.size == template.size, 'gridDivisible': w % 3 == 0 and h % 5 == 0, 'transparentPixels': hist[0], 'opaquePixels': hist[255], 'partialAlphaPixels': sum(hist[1:255]), 'cells': cells})
    report['templates'].append({'id': id, 'referenceRef': current_ref, 'references': refs, 'deliveries': deliveries})
print(json.dumps(report, indent=2))
