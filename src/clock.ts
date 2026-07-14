// clock.ts — a Web Worker timer that drives the sequencer. requestAnimationFrame stops
// when the tab is backgrounded, which would freeze scheduling; a worker's setInterval keeps
// firing (browsers relax timer throttling for pages that are audibly playing), so the beat
// continues in the background.
let id: ReturnType<typeof setInterval> | undefined;
self.onmessage = (e: MessageEvent) => {
  const d = e.data as { type: string; interval?: number };
  if (d.type === "start") {
    if (id) clearInterval(id);
    id = setInterval(() => (self as unknown as Worker).postMessage("tick"), d.interval ?? 40);
  } else if (d.type === "stop") {
    if (id) clearInterval(id);
    id = undefined;
  }
};
