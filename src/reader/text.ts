/**
 * Text decoding helpers over plain `Uint8Array`s — the browser-safe
 * replacement for `Buffer#toString`. Available in Node, browsers and Web
 * Workers alike.
 *
 * `ignoreBOM: true` keeps a leading U+FEFF in the output, matching
 * `Buffer#toString("utf8")` byte for byte; invalid sequences decode to
 * U+FFFD in both.
 */
const utf8Decoder = new TextDecoder("utf-8", { ignoreBOM: true });

/** Decode `bytes[start, end)` as UTF-8. */
export function decodeUtf8(bytes: Uint8Array, start = 0, end = bytes.length): string {
  if (start === 0 && end === bytes.length) return utf8Decoder.decode(bytes);
  return utf8Decoder.decode(bytes.subarray(start, end));
}

/**
 * Decode `bytes[start, end)` as ISO-8859-1 (one byte → one code point),
 * like `Buffer#toString("latin1")`. WHATWG's TextDecoder maps "latin1" to
 * windows-1252, which differs in 0x80–0x9F, so this is done by hand.
 */
export function decodeLatin1(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let out = "";
  for (let i = start; i < end; i += 4096) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + 4096, end)));
  }
  return out;
}
