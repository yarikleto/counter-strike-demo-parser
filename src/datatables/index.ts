/**
 * Public barrel for the datatables layer.
 *
 * Re-exports the SendTable / ServerClass types and their registries plus the
 * `parseDataTables` entry point. Consumers of the parser library import
 * everything datatables-related from here; internal modules import directly
 * from the sibling files.
 */
export type {
  SendTable,
  SendProp,
  SendPropTypeValue,
} from "./SendTable.js";
export { SendPropType } from "./SendTable.js";
export { SendTableRegistry } from "./SendTableRegistry.js";
export type { ServerClass, FlattenedSendProp } from "./ServerClass.js";
export { ServerClassRegistry } from "./ServerClassRegistry.js";
export { parseDataTables } from "./DataTablesParser.js";
export type { DataTablesParseResult } from "./DataTablesParser.js";
