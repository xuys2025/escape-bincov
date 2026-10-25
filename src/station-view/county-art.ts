// County map art for the deploy panel. Only the renderer imports this module (src/station-view/host.ts): esbuild
// inlines each WebP as a data URL, while Node tests keep loading deploy-map.ts without image modules.
// scripts/build.mjs checks these imports against assets/county-map/manifest.json and briefing-concepts/manifest.json.
import terrain from '../../assets/county-map/county-terrain.webp';
import factory from '../../assets/county-map/briefing-concepts/factory.webp';
import freighter from '../../assets/county-map/briefing-concepts/freighter.webp';
import harbor from '../../assets/county-map/briefing-concepts/harbor.webp';
import highway from '../../assets/county-map/briefing-concepts/highway.webp';
import hospital from '../../assets/county-map/briefing-concepts/hospital.webp';
import laboratory from '../../assets/county-map/briefing-concepts/laboratory.webp';
import lighthouse from '../../assets/county-map/briefing-concepts/lighthouse.webp';
import mall from '../../assets/county-map/briefing-concepts/mall.webp';
import market from '../../assets/county-map/briefing-concepts/market.webp';
import observatory from '../../assets/county-map/briefing-concepts/observatory.webp';
import oldHospital from '../../assets/county-map/briefing-concepts/old-hospital.webp';
import oldTown from '../../assets/county-map/briefing-concepts/old-town.webp';
import type { CountyArt } from './deploy-map';

export const COUNTY_ART: CountyArt = {
  terrain,
  regions: { 'old-town': oldTown, mall, hospital, 'old-hospital': oldHospital, factory, laboratory, highway, market, observatory, lighthouse, harbor, freighter },
};
