/**
 * Public barrel for the stringtables layer.
 *
 * Re-exports the StringTable shape, the manager, and the entry-stream parser.
 * Consumers of the parser library import everything stringtable-related from
 * here; internal modules import directly from sibling files.
 */
export { StringTable } from "./StringTable.js";
export type { StringTableEntry, StringTableOptions } from "./StringTable.js";
export { StringTableManager } from "./StringTableManager.js";
export {
  parseStringTableEntries,
  bitsForMaxEntries,
} from "./StringTableParser.js";
export type { ParseStringTableResult } from "./StringTableParser.js";
