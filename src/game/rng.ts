export class RNG {
  state: number;
  constructor(seed: string) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++)
      h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    this.state = h >>> 0;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
}
