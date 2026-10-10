import type { PracticeSample } from './contract';
/** Approved prototype layout, 32 world px/tile. Kept in logic so the host cannot claim inZone. */
export const STATION_TRAINING = Object.freeze({ tile: 32, x: 10, y: 9, w: 12, h: 8, maxSpeed: 168, radius: 10 });
export const STATION_POOLS = Object.freeze([
    { x: 11, y: 10, w: 3, h: 2 }, { x: 15, y: 10, w: 3, h: 2 },
    { x: 11, y: 13, w: 3, h: 2 }, { x: 15, y: 13, w: 3, h: 2 },
].map(p => Object.freeze(p)));
export function validPractice(sample: PracticeSample): boolean {
    if (!sample || !sample.from || !sample.to || !Number.isSafeInteger(sample.now) || sample.now < 0
        || !Number.isFinite(sample.seconds) || sample.seconds <= 0 || sample.seconds > .25
        || ![sample.from.x, sample.from.y, sample.to.x, sample.to.y].every(Number.isFinite)) return false;
    const { from, to, seconds } = sample, distance = Math.hypot(to.x - from.x, to.y - from.y), z = STATION_TRAINING;
    if (distance < .01 || distance > z.maxSpeed * seconds + 1e-6) return false;
    const steps = Math.max(1, Math.ceil(distance / 4));
    for (let i = 0; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * i / steps, y = from.y + (to.y - from.y) * i / steps;
        if (x < z.x * 32 + z.radius || y < z.y * 32 + z.radius || x >= (z.x + z.w) * 32 - z.radius || y >= (z.y + z.h) * 32 - z.radius) return false;
        if (STATION_POOLS.some(p => x > p.x * 32 - z.radius && x < (p.x + p.w) * 32 + z.radius && y > p.y * 32 - z.radius && y < (p.y + p.h) * 32 + z.radius)) return false;
    }
    return true;
}
