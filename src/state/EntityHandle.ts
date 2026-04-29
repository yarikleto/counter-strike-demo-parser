/**
 * EntityHandle — utilities for working with Source engine entity handles.
 *
 * Source's entity handle is an integer that packs an entity index together
 * with a serial number. The serial-number bits guard against ABA reuse: when
 * a slot is freed and a new entity allocated at the same index, the new
 * entity gets a fresh serial. A handle issued before the reuse compares
 * unequal on serial and resolves to `undefined`.
 *
 * Two wire forms exist in CS:GO demos and the resolver accepts both:
 *
 *   - **32-bit form** (raw C++ handle from the engine):
 *     `[ 21 bits serial | 11 bits index ]` — total 32 bits. The all-bits-set
 *     value `0xFFFFFFFF` is the `INVALID_HANDLE` sentinel meaning "no
 *     entity."
 *   - **21-bit form** (packed inside SendProp wire data, e.g. on
 *     `m_hMyWeapons.NNN` and `m_hActiveWeapon`, which use
 *     `nBits=21, UNSIGNED|NOSCALE`):
 *     `[ 10 bits serial | 11 bits index ]` — total 21 bits. There is no
 *     dedicated sentinel; an "empty" weapon slot is conventionally encoded
 *     with all bits set to indicate index `2047` and serial `1023`, which
 *     resolves through the same path (slot 2047 is normally empty so
 *     `EntityList.get` returns `undefined`).
 *
 * The resolver picks the form by inspecting the high bits: if all bits
 * above bit 20 are zero AND the value is not the 32-bit `INVALID_HANDLE`
 * sentinel, the 21-bit form is assumed; otherwise the 32-bit form. Callers
 * pass whichever form they happen to have — there is no flag.
 */
import type { EntityList } from "../entities/EntityList.js";
import type { Entity } from "../entities/Entity.js";

/** Bits used for the entity index in either handle form. 11 bits → 0..2047. */
export const ENTITY_INDEX_BITS = 11;

/** Mask covering the index portion (lower bits). */
export const ENTITY_INDEX_MASK = (1 << ENTITY_INDEX_BITS) - 1;

/** Number of serial bits in the 32-bit (raw C++) handle form. */
export const ENTITY_SERIAL_BITS_32 = 21;

/** Number of serial bits in the 21-bit (packed SendProp) handle form. */
export const ENTITY_SERIAL_BITS_21 = 10;

/** Width (in bits) of the 21-bit packed form. */
const PACKED_HANDLE_BITS = 21;

/** Mask covering the entire 21-bit packed form. */
const PACKED_HANDLE_MASK = (1 << PACKED_HANDLE_BITS) - 1;

/**
 * Sentinel "no entity" value. Source uses all-bits-set on the 32-bit form.
 *
 * Coerced via `>>> 0` so the constant is the unsigned `0xFFFFFFFF`
 * representation rather than the signed `-1` JavaScript would otherwise
 * produce for the bitwise NOT of zero.
 */
export const INVALID_HANDLE = 0xffffffff >>> 0;

/**
 * Extract the entity index (lower 11 bits) from a handle in either form.
 *
 * Works identically for 32-bit and 21-bit handles because both forms place
 * the index in the same low bits.
 */
export function handleToIndex(handle: number): number {
  return handle & ENTITY_INDEX_MASK;
}

/**
 * Extract the serial number from a handle.
 *
 * Auto-detects the form: returns the 10-bit serial for packed 21-bit
 * handles and the 21-bit serial for 32-bit handles. The `INVALID_HANDLE`
 * sentinel returns its 32-bit serial portion (all ones in 21 bits) — but
 * callers should gate with `isValidHandle` first.
 */
export function handleToSerial(handle: number): number {
  if (isPacked21BitForm(handle)) {
    return (handle >>> ENTITY_INDEX_BITS) & ((1 << ENTITY_SERIAL_BITS_21) - 1);
  }
  return (
    (handle >>> ENTITY_INDEX_BITS) & ((1 << ENTITY_SERIAL_BITS_32) - 1)
  );
}

/**
 * True for any handle that is not the `INVALID_HANDLE` sentinel.
 *
 * Note: a valid-looking handle may still resolve to `undefined` via
 * `resolveHandle` if the slot is empty or the serial is stale. This check
 * only filters the "explicit none" sentinel.
 */
export function isValidHandle(handle: number): boolean {
  return (handle >>> 0) !== INVALID_HANDLE;
}

/**
 * Resolve a handle to an `Entity`, validating both the slot occupancy and
 * the serial number.
 *
 * Returns `undefined` when:
 *   - The handle is `INVALID_HANDLE`.
 *   - No entity occupies the resolved slot (empty / out-of-range).
 *   - The entity at that slot has a different serial than the handle —
 *     i.e., the slot was reused since the handle was issued.
 *
 * Accepts both 32-bit and 21-bit handle forms — see the file-level comment
 * for the wire formats and detection rules.
 */
export function resolveHandle(
  list: EntityList,
  handle: number,
): Entity | undefined {
  if (!isValidHandle(handle)) return undefined;
  const index = handleToIndex(handle);
  const entity = list.get(index);
  if (entity === undefined) return undefined;

  const handleSerial = handleToSerial(handle);
  const serialMask = isPacked21BitForm(handle)
    ? (1 << ENTITY_SERIAL_BITS_21) - 1
    : (1 << ENTITY_SERIAL_BITS_32) - 1;
  const entitySerial = entity.serialNumber & serialMask;
  if (entitySerial !== handleSerial) return undefined;
  return entity;
}

/**
 * True when the handle fits inside 21 bits AND is not the 32-bit
 * `INVALID_HANDLE` sentinel — i.e., it was packed from a SendProp.
 */
function isPacked21BitForm(handle: number): boolean {
  if ((handle >>> 0) === INVALID_HANDLE) return false;
  return ((handle >>> 0) & ~PACKED_HANDLE_MASK) === 0;
}
