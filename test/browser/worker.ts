/**
 * Web Worker used by the browser smoke test — also the reference for the
 * README's worker example. Imports the package by name, so resolution goes
 * through package.json "exports" with the "browser" condition.
 */
import {
  hitBuffers,
  parseDemo,
  positionBuffers,
  shotBuffers,
  voiceBuffers,
} from "counter-strike-demo-parser";

let controller: AbortController | undefined;

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as { type: "parse"; url: string } | { type: "cancel" };
  if (msg.type === "cancel") {
    controller?.abort();
    return;
  }
  controller = new AbortController();
  try {
    const started = performance.now();
    const bytes = new Uint8Array(await (await fetch(msg.url)).arrayBuffer());
    const fetchedMs = performance.now() - started;
    const result = await parseDemo(bytes, {
      collectPlayerPositions: true,
      positionSampleRateTicks: 8,
      collectVoice: true,
      signal: controller.signal,
      onProgress: (p) => self.postMessage({ type: "progress", fraction: p.fraction }),
    });
    const parseMs = performance.now() - started - fetchedMs;
    const transfer = [
      ...positionBuffers(result.positions!),
      ...shotBuffers(result.shots),
      ...hitBuffers(result.hits),
      ...voiceBuffers(result.voice!),
    ];
    self.postMessage({ type: "done", result, fetchedMs, parseMs }, { transfer });
    // After a transfer the worker's copies are detached (zero-copy hand-off).
    self.postMessage({
      type: "detached",
      byteLength:
        result.positions!.x.byteLength +
        result.shots.x.byteLength +
        result.hits.victimX.byteLength +
        result.voice!.data.byteLength,
    });
  } catch (err) {
    self.postMessage({ type: "error", name: (err as Error).name, message: String(err) });
  }
};
