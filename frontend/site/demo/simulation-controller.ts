interface Sequence {
  move(): void;
  click(): void;
  hide(): void;
  reducedMotion: boolean;
}
export function scheduleSimulation(sequence: Sequence): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  if (!sequence.reducedMotion) timers.push(setTimeout(sequence.move, 300));
  timers.push(setTimeout(sequence.click, sequence.reducedMotion ? 0 : 1600));
  timers.push(setTimeout(sequence.hide, sequence.reducedMotion ? 0 : 2100));
  return () => timers.forEach(clearTimeout);
}
