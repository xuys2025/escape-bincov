import { test } from 'node:test';
import { playConservation } from './fixtures/conservation';

// Gunsmith M1-07, seeds 101 to 200 (see gunsmith-conservation.test.ts); a separate file so the unit run plays both halves
// in parallel. With GUNSMITH_SEEDS set, the first file replays the chosen seeds and this one skips.
test('M1-07: random legal play keeps every gun, part, round and coin, through failed writes, retries and backups (seeds 101 to 200)',
    { skip: process.env.GUNSMITH_SEEDS ? 'GUNSMITH_SEEDS replays in gunsmith-conservation.test.ts' : false },
    t => playConservation(t, '101-200'));
