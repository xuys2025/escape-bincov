import assert from 'node:assert/strict';
import test from 'node:test';
import { countyMapHtml, deploymentRegion, deploymentWorld, regionBriefHtml, type CountyArt, type RegionId } from '../src/station-view/deploy-map';

const IDS: RegionId[] = ['old-town', 'mall', 'hospital', 'old-hospital', 'factory', 'laboratory', 'highway', 'market', 'observatory', 'lighthouse', 'harbor', 'freighter'];
const ART = Object.fromEntries(IDS.map(id => [id, `art/${id}.webp`])) as CountyArt['regions'];
const WORLDS = ['buildings', 'mall'] as const;
/** Marker anchors (percent of the art) and label sides, read back from the markup. */
const markers = (html: string) => [...html.matchAll(/data-side="([lrtb])" style="--x:([\d.]+);--y:([\d.]+)"/g)].map(m => ({ side: m[1], x: Number(m[2]), y: Number(m[3]) }));
const sides = (html: string) => Object.fromEntries([...html.matchAll(/data-side="([lrtb])"[^>]*?data-region="([a-z-]+)"/g)].map(m => [m[2], m[1]]));

test('only the existing worlds deploy: every other region is a preview, whatever world was chosen before', () => {
  for (const id of IDS) {
    const region = deploymentRegion(WORLDS, 'mall', id);
    assert.equal(region.id, id);
    assert.equal(deploymentWorld(region, WORLDS), id === 'old-town' ? 'buildings' : id === 'mall' ? 'mall' : null, id);
  }
  // The host's allowlist stays authoritative: a world it no longer offers cannot deploy from its own map slot.
  assert.equal(deploymentWorld(deploymentRegion(['buildings'], 'buildings', 'mall'), ['buildings']), null);
  assert.equal(deploymentRegion(WORLDS, 'mall', 'not-a-region').id, 'mall');
});

test('the map places twelve regions and the station inside the art and draws a route only to an open pick', () => {
  const html = countyMapHtml(deploymentRegion(WORLDS, 'mall', null), WORLDS, false);
  const marks = markers(html);
  assert.equal(marks.length, 13);
  assert.ok(marks.every(m => m.x > 5 && m.x < 95 && m.y > 5 && m.y < 95), JSON.stringify(marks));
  assert.equal(new Set(marks.map(m => `${m.x},${m.y}`)).size, 13);
  assert.equal((html.match(/class="county-node world available/g) ?? []).length, 2);
  assert.equal((html.match(/class="county-node unbuilt/g) ?? []).length, 10);
  // The route runs from the station to the picked landmark (art pixels: 1536 x 1024).
  const route = html.match(/class="route-bed" pathLength="1" d="M([\d.]+) ([\d.]+)[^"]*?([\d.]+) ([\d.]+)"/);
  assert.ok(route, 'an open pick has a route');
  const [sx, sy, ex, ey] = route.slice(1).map(Number);
  assert.ok(Math.hypot(sx / 15.36 - 35, sy / 10.24 - 87.5) < 3, 'the route leaves from the station');
  assert.ok(Math.hypot(ex / 15.36 - 44.5, ey / 10.24 - 52.5) < .1, 'the route ends on the mall');
  assert.doesNotMatch(countyMapHtml(deploymentRegion(WORLDS, 'mall', 'lighthouse'), WORLDS, false), /county-route/);
  // The terrain is painted from the UI root's custom property; the markup never repeats its data URL.
  assert.doesNotMatch(html, /webp|data:image/);
});

test('upright phones move only the labels that would collide on the 390 px wide map', () => {
  const pick = deploymentRegion(WORLDS, 'mall', null);
  const wide = sides(countyMapHtml(pick, WORLDS, false)), narrow = sides(countyMapHtml(pick, WORLDS, true));
  const moved = Object.keys(wide).filter(id => wide[id] !== narrow[id]).sort();
  assert.deepEqual(moved, ['freighter', 'market', 'observatory']);
  assert.deepEqual([narrow.market, narrow.observatory, narrow.freighter], ['r', 'b', 'b']);
});

test('each briefing shows its own art, and the 暂未开发 status stays outside the picture', () => {
  for (const id of IDS) {
    const region = deploymentRegion(WORLDS, 'mall', id), html = regionBriefHtml(region, WORLDS, ART);
    assert.match(html, new RegExp(`<img src="art/${id}\\.webp"`), id);
    assert.match(html, new RegExp(`data-key="art-${id}"`));
    const status = html.indexOf('<p class="region-eyebrow"'), figure = html.indexOf('<figure');
    assert.ok(status >= 0 && status < figure, 'status line precedes the picture');
    assert.equal(html.includes('暂未开发'), !deploymentWorld(region, WORLDS), id);
  }
  // The legacy test-only raid has no art: its briefing is text only.
  const legacy = regionBriefHtml(deploymentRegion(['coast', ...WORLDS], 'coast', null), ['coast', ...WORLDS], ART);
  assert.match(legacy, /region-art bare/);
  assert.doesNotMatch(legacy, /<img/);
});
