import { test } from 'node:test';
import { playConservation } from './fixtures/conservation';

// Gunsmith M1-07: random legal play keeps every gun, part, round and coin (tests/fixtures/conservation.ts says how).
// Seeds 1 to 100 here, 101 to 200 in gunsmith-conservation-2.test.ts. GUNSMITH_SEEDS replays chosen seeds in this file.
test('M1-07: random legal play keeps every gun, part, round and coin, through failed writes, retries and backups (seeds 1 to 100)',
    t => playConservation(t, '1-100'));
