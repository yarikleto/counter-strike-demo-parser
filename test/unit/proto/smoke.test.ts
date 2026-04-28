import { describe, it, expect } from 'vitest';

import {
  CNETMsg_Tick,
  CSVCMsg_ServerInfo,
  CSVCMsg_GameEventList,
} from '../../../src/proto/index.js';

describe('proto re-exports (smoke)', () => {
  it('exposes ts-proto codec objects with encode/decode', () => {
    for (const codec of [CNETMsg_Tick, CSVCMsg_ServerInfo, CSVCMsg_GameEventList]) {
      expect(typeof codec.encode).toBe('function');
      expect(typeof codec.decode).toBe('function');
    }
  });

  it('round-trips an empty CSVCMsg_ServerInfo through encode/decode', () => {
    // Default-constructed messages should encode to a buffer the same codec
    // can decode back into a structurally-equal value. This proves the
    // generated runtime is wired up correctly.
    const original = CSVCMsg_ServerInfo.fromPartial({});
    const bytes = CSVCMsg_ServerInfo.encode(original).finish();
    const round = CSVCMsg_ServerInfo.decode(bytes);
    expect(round).toEqual(original);
  });

  it('decodes a CNETMsg_Tick with a known field value', () => {
    const bytes = CNETMsg_Tick.encode(CNETMsg_Tick.fromPartial({ tick: 12345 })).finish();
    const decoded = CNETMsg_Tick.decode(bytes);
    expect(decoded.tick).toBe(12345);
  });
});
