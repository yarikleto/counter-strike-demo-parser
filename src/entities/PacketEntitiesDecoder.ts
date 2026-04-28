/**
 * PacketEntitiesDecoder — decodes a `CSVCMsg_PacketEntities` bit-stream into
 * a stream of entity create / update / delete events against an `EntityList`.
 *
 * Reference: `markus-wa/demoinfocs-golang/pkg/demoinfocs/datatables.go::handlePacketEntities`
 * and `pkg/demoinfocs/sendtables/entity.go::ApplyUpdate`. The architect's brief
 * (`.claude/decisions/TASK-026-impl-brief.md`, Section 4) is the canonical
 * description of this layer.
 *
 * Wire structure (per `entity_data` payload):
 *   entityIndex = -1
 *   for i in 0..updated_entries:
 *     delta = readUBitVar()
 *     entityIndex += delta + 1
 *     opFlag = readBits(2)   // bit 0 = leave-PVS, bit 1 = enter-PVS
 *     - 0b00 (preserve): existing entity update; read changed-prop list and decode.
 *     - 0b01 (leave-PVS): mark dormant; storage preserved, no event in M2.
 *     - 0b10 (enter-PVS): new entity; read classId + serial; apply baseline; read changed-prop list.
 *     - 0b11 (leave + delete): free the slot; emit entityDeleted before bumping the version.
 *
 * Pure function over its dependencies. State lives entirely in the
 * `EntityList` and the per-class `EntityStore`s; this module owns no fields.
 */
import { BitReader } from "../reader/BitReader.js";
/**
 * Source's `ReadUBitInt` from `bitbuf.cpp` — distinct from `readUBitVar`.
 *
 * Reads 6 bits where bits[4:5] form the selector and bits[0:3] are data:
 *   - selector 0      → 4-bit value
 *   - selector 1 (16) → 4 + 4 more bits = 8-bit value
 *   - selector 2 (32) → 4 + 8 more bits = 12-bit value
 *   - selector 3 (48) → 4 + 28 more bits = up to 32-bit value
 *
 * Used for the per-entity index delta in PacketEntities.
 *
 * Reference: `markus-wa/demoinfocs-golang/pkg/bitread/bitread.go::ReadUBitInt`.
 */
function readUBitInt(reader: BitReader): number {
  const ret = reader.readBits(6);
  const tag = ret & 0x30;
  const low = ret & 0x0f;
  switch (tag) {
    case 0x10:
      return (low | (reader.readBits(4) << 4)) >>> 0;
    case 0x20:
      return (low | (reader.readBits(8) << 4)) >>> 0;
    case 0x30:
      return (low | (reader.readBits(28) << 4)) >>> 0;
    default:
      return ret;
  }
}
import type { CSVCMsg_PacketEntities } from "../proto/index.js";
import type { ServerClassRegistry } from "../datatables/ServerClassRegistry.js";
import type { StringTableManager } from "../stringtables/StringTableManager.js";
import { decodeProp } from "../properties/decodeProp.js";
import { EntityList } from "./EntityList.js";
import type { Entity } from "./Entity.js";
import { getOrDecodeBaseline, applyBaseline } from "./InstanceBaseline.js";

/**
 * Read the next `flatPropIndex` from the entity's changed-prop bit stream,
 * or `-1` for end-of-list.
 *
 * Wire format per `markus-wa/demoinfocs-golang/pkg/demoinfocs/sendtables/entity.go::readFieldIndex`:
 *
 *   if newWay && readBit():
 *     return lastIndex + 1                    // sequential "+1" fast path
 *
 *   if newWay && readBit():
 *     ret = readBits(3)                       // small-delta, 0..7
 *   else:
 *     ret = readBits(7)
 *     switch (ret & 0x60):                    // bits 5..6 are tag
 *       case 0x20: ret = (ret & 0x1F) | (readBits(2) << 5)
 *       case 0x40: ret = (ret & 0x1F) | (readBits(4) << 5)
 *       case 0x60: ret = (ret & 0x1F) | (readBits(7) << 5)
 *
 *   if ret == 0xFFF: return -1                // terminator
 *   return lastIndex + 1 + ret
 *
 * `newWay` is a one-bit flag read once per entity, BEFORE the field-index
 * loop. Modern CSGO demos always set it; older demos may not.
 */
function readFieldIndex(
  reader: BitReader,
  lastIndex: number,
  newWay: boolean,
): number {
  if (newWay && reader.readBit() === 1) {
    return lastIndex + 1;
  }
  let ret: number;
  if (newWay && reader.readBit() === 1) {
    ret = reader.readBits(3);
  } else {
    ret = reader.readBits(7);
    const tag = ret & 0x60;
    if (tag === 0x20) {
      ret = (ret & 0x1f) | (reader.readBits(2) << 5);
    } else if (tag === 0x40) {
      ret = (ret & 0x1f) | (reader.readBits(4) << 5);
    } else if (tag === 0x60) {
      ret = (ret & 0x1f) | (reader.readBits(7) << 5);
    }
  }
  if (ret === 0xfff) return -1;
  return lastIndex + 1 + ret;
}

/**
 * Read one entity's changed-prop list AND interleave-decode each prop value
 * directly into `entity`'s storage. Returns nothing; mutates the store.
 *
 * Per `markus-wa/demoinfocs-golang/pkg/demoinfocs/sendtables/entity.go::ApplyUpdate`:
 *   newWay = readBit()
 *   idx    = -1
 *   loop:
 *     idx = readFieldIndex(reader, idx, newWay)
 *     if idx == -1: break
 *     decodeProp(reader, props[idx]) -> write to slot
 */
function readAndApplyChangedProps(reader: BitReader, entity: Entity): void {
  const props = entity.serverClass.flattenedProps;
  const total = props.length;
  const newWay = reader.readBit() === 1;
  let lastIndex = -1;
  while (true) {
    lastIndex = readFieldIndex(reader, lastIndex, newWay);
    if (lastIndex === -1) return;
    if (lastIndex < 0 || lastIndex >= total) {
      throw new RangeError(
        `decodePacketEntities: decoded prop index ${lastIndex} is out of ` +
          `range [0, ${total}) for ${entity.serverClass.className} — likely ` +
          `wire-format divergence (TASK-021a) or flatten miscount.`,
      );
    }
    const value = decodeProp(reader, props[lastIndex]!);
    entity.store.write(entity.storageSlot, lastIndex, value);
  }
}

/**
 * Listener triple invoked synchronously by `decodePacketEntities`. The
 * decoder is otherwise side-effect-free; emission is the only observable.
 */
export interface PacketEntitiesEmit {
  onCreate: (entity: Entity) => void;
  onUpdate: (entity: Entity) => void;
  onDelete: (entity: Entity) => void;
}

/**
 * Decode one `CSVCMsg_PacketEntities` message, mutating the `entityList` and
 * the per-class `EntityStore`s, and emitting `onCreate` / `onUpdate` /
 * `onDelete` for each affected entity in wire order.
 */
export function decodePacketEntities(
  msg: CSVCMsg_PacketEntities,
  entityList: EntityList,
  serverClassRegistry: ServerClassRegistry,
  stringTables: StringTableManager,
  emit: PacketEntitiesEmit,
): void {
  const data = msg.entityData ?? new Uint8Array();
  if (data.length === 0) return;
  const reader = new BitReader(data);
  const updatedEntries = msg.updatedEntries ?? 0;

  // Bits to encode a class ID. Source uses `ceil(log2(numClasses))`, with a
  // floor of 1 for the (degenerate) one-class case.
  const classIdBits = Math.max(
    1,
    Math.ceil(Math.log2(Math.max(2, serverClassRegistry.size))),
  );

  let prevEntityIndex = -1;

  for (let i = 0; i < updatedEntries; i++) {
    const indexDelta = readUBitInt(reader);
    const entityId = prevEntityIndex + 1 + indexDelta;
    prevEntityIndex = entityId;

    // 2-bit op flag, read as two single bits in wire order.
    const isLeaving = reader.readBit() === 1;
    if (isLeaving) {
      const isDelete = reader.readBit() === 1;
      if (isDelete) {
        // Emit BEFORE delete so listeners can read final values (the slot
        // version is still the one captured by the Entity view at this
        // point — `EntityList.delete` bumps it).
        const existing = entityList.get(entityId);
        if (existing !== undefined) {
          emit.onDelete(existing);
          entityList.delete(entityId);
        }
      } else {
        entityList.leavePVS(entityId);
      }
      continue;
    }

    const isEntering = reader.readBit() === 1;
    if (isEntering) {
      // New entity (or re-create at the same id): read classId + serial and
      // a fresh changed-prop list. Apply baseline before the create-delta so
      // the delta overrides any baseline-default fields.
      const classId = reader.readBits(classIdBits);
      const serialNumber = reader.readBits(10);

      const serverClass = serverClassRegistry.byId(classId);
      if (serverClass === undefined) {
        throw new Error(
          `decodePacketEntities: unknown classId ${classId} at entityId ${entityId}`,
        );
      }

      // EntityList.create handles same-id-different-class (throws) and
      // same-class re-create (frees old slot, allocates new) per ADR-002.
      const entity = entityList.create(entityId, serverClass, serialNumber);

      // Baseline lookup is best-effort — the instancebaseline string-table
      // entry can race with ClassInfo, and on real CSGO demos the cached
      // baseline blob can fail to decode (TASK-025 known divergence). On
      // failure we fall through to the create-delta which carries enough
      // state for a usable entity in practice.
      let baseline;
      try {
        baseline = getOrDecodeBaseline(serverClass, stringTables);
      } catch {
        baseline = undefined;
      }
      if (baseline !== undefined) {
        applyBaseline(baseline, (propIdx, value) => {
          entity.store.write(entity.storageSlot, propIdx, value);
        });
      }

      readAndApplyChangedProps(reader, entity);
      emit.onCreate(entity);
      continue;
    }

    // PVS_PRESERVE: standard update — existing entity, just read changed props.
    const entity = entityList.get(entityId);
    if (entity === undefined) {
      throw new Error(
        `decodePacketEntities: update for unknown entity ${entityId}`,
      );
    }
    readAndApplyChangedProps(reader, entity);
    emit.onUpdate(entity);
  }
}
