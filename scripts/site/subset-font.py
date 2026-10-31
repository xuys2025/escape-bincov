"""Maintainer-only regeneration of the official site's pixel font (site/assets/fonts/).

Usage: python scripts/site/subset-font.py /path/to/ChillBitmap_16px.ttf
Same pinned upstream file and tools as the game font (assets/fonts/README.md). The subset covers printable ASCII plus
every other character in site/index.html, site/js and site/css; scripts/site/build.mjs refuses to build when the site
uses a character that characters.txt lacks, so rerun this after changing the site's text.
"""
import hashlib
import sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

source = Path(sys.argv[1])
assert hashlib.sha256(source.read_bytes()).hexdigest() == '9c699de0d24e482700fa0a08ce3abe58ef2ceaf6173323c77b767c72cd538512'
root = Path(__file__).resolve().parents[2] / 'site'
text = ''.join(p.read_text(encoding='utf-8') for p in [root / 'index.html', *sorted((root / 'js').glob('*.js')), *sorted((root / 'css').glob('*.css'))])
chars = ''.join(sorted({chr(c) for c in range(0x20, 0x7f)} | {c for c in text if ord(c) > 0x7e and not c.isspace()}))
font = TTFont(source, recalcTimestamp=False)
missing = sorted(set(map(ord, chars)) - set(font.getBestCmap()))
assert not missing, f'Upstream font lacks code points: {missing}'
options = subset.Options()
options.flavor = 'woff2'; options.name_IDs = ['*']; options.name_languages = ['*']; options.name_legacy = True
subsetter = subset.Subsetter(options=options); subsetter.populate(text=chars); subsetter.subset(font)
# Subsetting is a modification: do not distribute under the upstream reserved family name.
names = {1: 'Bincov Site', 2: 'Regular', 3: 'Bincov Site Regular 1.000', 4: 'Bincov Site Regular', 6: 'BincovSite-Regular', 16: 'Bincov Site', 17: 'Regular'}
for record in font['name'].names:
    if record.nameID in names: record.string = names[record.nameID].encode(record.getEncoding())
font.flavor = 'woff2'
target = root / 'assets/fonts/bincov-site.woff2'
font.save(target)
(root / 'assets/fonts/characters.txt').write_text(chars + '\n', encoding='utf-8', newline='\n')
print(f'Generated {target}: {len(chars)} characters, {target.stat().st_size} bytes')
