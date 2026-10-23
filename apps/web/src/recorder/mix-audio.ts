/** Mixes several audio streams into one (the microphone + a shared tab, Task 1.34). A source that ends just goes silent. */
export function mixAudio(streams: MediaStream[]) {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const sources = streams.map((s) => {
    const source = ctx.createMediaStreamSource(s);
    source.connect(dest);
    return source;
  });
  return {
    stream: dest.stream,
    close() {
      sources.forEach((s) => s.disconnect());
      void ctx.close();
    },
  };
}

/** Chrome and Edge on a computer can share a tab's sound; Safari and Firefox share a screen without it. */
export function canRecordTab() {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  return typeof md?.getDisplayMedia === "function" && /Chrome\/|Edg\//.test(navigator.userAgent) && !/Mobile|Android/.test(navigator.userAgent);
}
