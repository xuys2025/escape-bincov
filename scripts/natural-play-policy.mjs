/** Automated-player policy, not game balance. All input describes committed or published state. */
export const NATURAL_PREPARATION_POLICY = Object.freeze({ readyHp: 70, carriedMedical: 1, totalRounds: 12 });
export const NATURAL_RETREAT_POLICY = Object.freeze({ hp: 60, rounds: 8 });

/** Keep a defensive magazine for the walk home instead of waiting until both gun and bag are empty. */
export function naturalRetreatReason(s) {
  if (s.hp < NATURAL_RETREAT_POLICY.hp) return 'low-health';
  if (s.mag + s.ammo <= NATURAL_RETREAT_POLICY.rounds) return 'ammunition-reserve';
  return null;
}

export function assessPreparation(s, policy = NATURAL_PREPARATION_POLICY) {
  const blocked = reason => ({ ready: false, reason });
  if (!s || !Number.isInteger(s.revision) || !s.confirmed) return blocked('committed-state-unconfirmed');
  if (!s.storageOK || s.conflict || s.pending) return blocked('storage-not-ready');
  if (s.phase !== 'hideout' || s.activeRun) return blocked('not-at-base');
  if (![s.hp, s.hpMax, s.cash, s.bagMedical, s.totalRounds, s.spareCells].every(Number.isFinite)
    || ![s.bagMedical, s.totalRounds, s.spareCells].every(Number.isInteger)
    || typeof s.bleeding !== 'boolean' || typeof s.gunReady !== 'boolean') return blocked('missing-preflight-fields');
  if (s.bleeding || s.hp < Math.min(policy.readyHp, s.hpMax)) return blocked('recover-through-real-ui-first');
  if (s.bagMedical < policy.carriedMedical) return blocked('pack-verified-medical-reserve');
  if (!s.gunReady || s.totalRounds < policy.totalRounds) return blocked('prepare-verified-gun-and-ammo');
  if (s.spareCells < 1) return blocked('make-bag-space-through-real-ui');
  return { ready: true, reason: 'verified-preparation-ready' };
}

export function confirmSupplyUse(before, after, uid) {
  if (!after.confirmed || !after.storageOK || after.conflict || after.pending)
    return { committed: false, reason: 'storage-not-ready' };
  if (after.revision <= before.revision) return { committed: false, reason: 'awaiting-committed-revision' };
  if ((before.quantities[uid] ?? 0) - (after.quantities[uid] ?? 0) !== 1)
    return { committed: false, reason: 'supply-consumption-not-observed' };
  if (!(after.hp > before.hp || before.bleeding && !after.bleeding))
    return { committed: false, reason: 'treatment-effect-not-observed' };
  return { committed: true, reason: 'committed-consumption-and-effect-observed' };
}

/** Apply the original loot overlay's 220px / LOS danger boundary to the destination and its live route. */
export function chooseSafeContainer(s, visited, route, sight) {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return s.containers.filter(c => c.items && !visited.has(`${c.x},${c.y}`)).map(container => {
    const path = route(s, container);
    const safe = path.length && [...path, container].every(p => !s.enemies.some(e => distance(e, p) < 220 && sight({ ...s, x: p.x, y: p.y }, e)));
    return { container, path, safe };
  }).filter(c => c.safe).sort((a, b) => a.path.length - b.path.length || a.container.id.localeCompare(b.container.id))[0] ?? null;
}

/** A disappearing source after death/closing the overlay is not proof of a committed native drag. */
export function confirmedNativeTransfer(before, after, containerId, item) {
  const count = bag => bag?.items.filter(i => i.id === item.id && !!i.relief === !!item.relief).reduce((n, i) => n + i.qty, 0) ?? 0;
  const source = before.containers?.find(c => c.id === containerId)?.inventory;
  const target = after.containers?.find(c => c.id === containerId)?.inventory;
  return before.state === 'run' && after.state === 'run' && typeof before.runId === 'string' && before.runId === after.runId
    && typeof before.map?.id === 'string' && before.map.id === after.map?.id
    && before.lootContext?.containerId === containerId && after.lootContext?.containerId === containerId
    && !!source?.items.some(i => i.uid === item.uid && i.id === item.id && i.qty === item.qty && !!i.relief === !!item.relief)
    && !!target && !target.items.some(i => i.uid === item.uid)
    && count(source) - count(target) === item.qty
    && count(after.bag) - count(before.bag) === item.qty;
}
