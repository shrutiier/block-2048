/** Overflow-line timer: loss after `limitMs` of continuous offence. */
export class OverflowTimer {
  since: number | null = null;

  constructor(private limitMs: number) {}

  update(now: number, offending: boolean): boolean {
    if (!offending) {
      this.since = null;
      return false;
    }
    if (this.since === null) this.since = now;
    return now - this.since >= this.limitMs;
  }

  /** 0..1 progress toward loss, for the countdown ring. */
  progress(now: number): number {
    return this.since === null ? 0 : Math.min(1, (now - this.since) / this.limitMs);
  }

  reset() { this.since = null; }
}
