/**
 * Typed error classes for the entity system.
 *
 * These errors signal honest, recoverable failures in the wire-format decode
 * or in consumer misuse of the Entity view. Throwing typed errors means
 * upstream consumers can catch them by class, and the parser can surface
 * them through its `error` event without losing structural information.
 */

/**
 * Thrown when an enter-PVS event arrives for an entity id whose currently-
 * occupied slot holds a different ServerClass than the wire claims.
 *
 * Per ADR-002 amendment: the wire protocol does not document a class-change
 * transition, demoinfocs-golang does not handle one, and supporting one
 * would require synthetic delete+create event emission. We throw and let the
 * parser decide whether to abort or recover. de_nuke does not trip this in
 * practice; if a real demo does, the architect revisits.
 */
export class EntityClassMismatchError extends Error {
  readonly entityId: number;
  readonly oldClassId: number;
  readonly newClassId: number;
  constructor(entityId: number, oldClassId: number, newClassId: number) {
    super(
      `EntityClassMismatchError: entity ${entityId} re-created with class ` +
        `${newClassId}, but slot still holds class ${oldClassId} ` +
        `(see ADR-002 amendment). Forbidden by parser policy.`,
    );
    this.name = "EntityClassMismatchError";
    this.entityId = entityId;
    this.oldClassId = oldClassId;
    this.newClassId = newClassId;
  }
}

/**
 * Thrown when an `Entity` view's read is attempted after its underlying
 * storage slot has been freed and the slot version has advanced.
 *
 * Consumers who hold an Entity reference past a delete tick will see this
 * loudly — much friendlier than silently reading stale typed-array data
 * or the next entity's data after slot reuse.
 */
export class StaleEntityError extends Error {
  readonly entityId: number;
  readonly viewVersion: number;
  readonly storeVersion: number;
  constructor(entityId: number, viewVersion: number, storeVersion: number) {
    super(
      `StaleEntityError: Entity view for id=${entityId} captured version ` +
        `${viewVersion}, but storage now reports version ${storeVersion}. ` +
        `The slot has been freed and possibly reused — discard the view.`,
    );
    this.name = "StaleEntityError";
    this.entityId = entityId;
    this.viewVersion = viewVersion;
    this.storeVersion = storeVersion;
  }
}

/**
 * Thrown when the bit cursor at the end of a PacketEntities `entity_data`
 * payload does not match the expected end-of-payload position (within a
 * 7-bit byte-pad allowance).
 *
 * Per the M2 pre-mortem #4: a one-bit cursor leak in any per-prop decoder
 * cascades into garbage for every subsequent entity in the same message.
 * Asserting cursor alignment at the end is the cheapest, loudest way to
 * catch this.
 */
export class BitStreamMisalignmentError extends Error {
  readonly expectedBits: number;
  readonly actualBits: number;
  constructor(expectedBits: number, actualBits: number) {
    super(
      `BitStreamMisalignmentError: expected end-of-payload at bit ` +
        `${expectedBits} (±7), got ${actualBits}. Likely a per-prop ` +
        `decoder read too few or too many bits.`,
    );
    this.name = "BitStreamMisalignmentError";
    this.expectedBits = expectedBits;
    this.actualBits = actualBits;
  }
}
