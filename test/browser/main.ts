/**
 * Browser smoke test page. Drives the worker and publishes a summary on
 * `window.smoke` for scripts/browser-smoke.mjs to read.
 *
 *   ?demo=/demo.dem          demo URL to parse (served by the smoke script)
 *   ?cancel=1                cancel after the first progress message instead
 */
import type { DemoResult } from "counter-strike-demo-parser";

interface Summary {
  status: "running" | "done" | "cancelled" | "error";
  error?: string;
  fetchedMs?: number;
  parseMs?: number;
  progressMessages: number;
  map?: string;
  rounds?: number;
  kills?: number;
  grenades?: number;
  positionRows?: number;
  workerBytesAfterTransfer?: number;
  receivedTypedArray?: boolean;
}

const params = new URLSearchParams(location.search);
const summary: Summary = { status: "running", progressMessages: 0 };
(window as unknown as { smoke: Summary }).smoke = summary;
const log = document.getElementById("log")!;
const show = () => (log.textContent = JSON.stringify(summary, null, 2));

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
worker.onmessage = (event: MessageEvent) => {
  const msg = event.data;
  if (msg.type === "progress") {
    summary.progressMessages++;
    if (params.has("cancel") && summary.progressMessages === 1) {
      worker.postMessage({ type: "cancel" });
    }
  } else if (msg.type === "done") {
    const result = msg.result as DemoResult;
    Object.assign(summary, {
      fetchedMs: Math.round(msg.fetchedMs),
      parseMs: Math.round(msg.parseMs),
      map: result.header.mapName,
      rounds: result.rounds.length,
      kills: result.kills.length,
      grenades: result.grenades.length,
      positionRows: result.positions!.length,
      receivedTypedArray: result.positions!.x instanceof Float32Array,
    });
  } else if (msg.type === "detached") {
    summary.workerBytesAfterTransfer = msg.byteLength;
    summary.status = "done";
  } else if (msg.type === "error") {
    summary.status = msg.name === "AbortError" ? "cancelled" : "error";
    summary.error = msg.message;
  }
  show();
};
worker.postMessage({ type: "parse", url: params.get("demo") ?? "/demo.dem" });
show();
