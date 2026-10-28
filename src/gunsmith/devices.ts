/**
 * Tactical devices (#28 M2-03): the lasers, lights and combiners installed on a gun, which of them are switched on, and
 * switching them. Pure rules over catalog.ts and instance.ts; the decisions are in docs/gunsmith/CONTRACTS.md, section
 * 「激光、灯光与枪声（M2-03、M2-11）」.
 *
 * One switch per device part (M0 review decision 9). A gun carries at most one laser effect and one light effect
 * (compat.ts's quota), so a part is named by its effect: the instance's `devices.laser` is the laser part's switch and
 * `devices.light` the light part's, while a combiner, one part with both effects, sets both to its one setting. Outside
 * this module only the workbench transaction (M2-04) may write the switches (tests/gunsmith-items.test.ts checks it).
 */
import { ATTACHMENTS } from './catalog';
import { nodesOf, type Devices, type GunState, type PartNode } from './instance';

/** A device effect, and the switch of the part that has it. */
export type DeviceEffect = keyof Devices;
/** One device part on a gun: its uid and catalog id, and the effects it has (both for a combiner). */
export interface DevicePart { uid: string; id: string; laser: boolean; light: boolean }

/** The device parts installed on a validated gun, in install order (nodesOf): none, one, a laser and a light, or a combiner. */
export function deviceParts(parts: readonly PartNode[]): DevicePart[] {
    return nodesOf(parts).flatMap(node => {
        const quota = ATTACHMENTS[node.id].quota;
        return quota ? [{ uid: node.uid, id: node.id, laser: quota !== 'light', light: quota !== 'laser' }] : [];
    });
}

/**
 * Whether a device part is on: a laser or a light part reads its effect's switch, and a combiner is on when either of
 * its two is (the game always writes them together; a stored pair that differs still reads as one setting).
 */
export const partOn = (part: DevicePart, devices: Devices): boolean => part.laser && devices.laser || part.light && devices.light;

/** The uids of the device parts switched on: the `on` list effectiveStats takes. */
export function devicesOn(gun: Pick<GunState, 'parts' | 'devices'>): string[] {
    return deviceParts(gun.parts).filter(part => partOn(part, gun.devices)).map(part => part.uid);
}

/**
 * Flip the device part that has `effect`, its one switch: a combiner turns both its effects on or off together. False,
 * with nothing changed, when no installed part has that effect.
 */
export function toggleDevice(gun: GunState, effect: DeviceEffect): boolean {
    const part = deviceParts(gun.parts).find(p => p[effect]);
    if (!part) return false;
    const on = !partOn(part, gun.devices);
    if (part.laser) gun.devices.laser = on;
    if (part.light) gun.devices.light = on;
    return true;
}

/**
 * The switches as the installed parts leave them: an effect no part has any more is off (a device goes off with its
 * part, M0 review decision 2), and a combiner's two switches take its one setting. The workbench transaction (M2-04)
 * calls this after it takes parts off and before it puts new ones on, so a replacement starts switched off;
 * validateGun refuses a gun whose switch is on without its part.
 */
export function settleDevices(gun: GunState): void {
    const parts = deviceParts(gun.parts), was = { ...gun.devices };
    gun.devices.laser = gun.devices.light = false;
    for (const part of parts) if (partOn(part, was)) { gun.devices.laser ||= part.laser; gun.devices.light ||= part.light; }
}
