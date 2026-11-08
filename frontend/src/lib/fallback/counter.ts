/** Atomic admission interface shared by all fallback requests. A durable store can replace it. */
export interface RunCounter { take(now: number, hourlyCap: number, dailyCap: number): Promise<boolean> }

/** UTC fixed-window counter for a single server process, with synchronous admission. */
export class MemoryRunCounter implements RunCounter {
  private hour = -1;
  private day = -1;
  private hourly = 0;
  private daily = 0;
  async take(now: number, hourlyCap: number, dailyCap: number): Promise<boolean> {
    const hour = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
    if (hour !== this.hour) { this.hour = hour; this.hourly = 0; }
    if (day !== this.day) { this.day = day; this.daily = 0; }
    if (this.hourly >= hourlyCap || this.daily >= dailyCap) return false;
    this.hourly++; this.daily++;
    return true;
  }
}
