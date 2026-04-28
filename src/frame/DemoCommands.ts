/**
 * Demo frame command types.
 *
 * Each frame in a .dem file starts with a command byte that identifies
 * the frame type. The payload format depends on the command type.
 */
export const DemoCommands = {
  /** Signon packet — same wire format as dem_packet, sent during signon phase. */
  DEM_SIGNON: 1,
  /** Network packet containing protobuf-encoded messages. */
  DEM_PACKET: 2,
  /** Sync marker — no payload. */
  DEM_SYNCTICK: 3,
  /** Console command string. */
  DEM_CONSOLECMD: 4,
  /** User input command. */
  DEM_USERCMD: 5,
  /** SendTable definitions (appears once during signon). */
  DEM_DATATABLES: 6,
  /** End of demo — stop parsing. */
  DEM_STOP: 7,
  /** Custom data blob. */
  DEM_CUSTOMDATA: 8,
  /** String table snapshot. */
  DEM_STRINGTABLES: 9,
} as const;

export type DemoCommand = (typeof DemoCommands)[keyof typeof DemoCommands];
