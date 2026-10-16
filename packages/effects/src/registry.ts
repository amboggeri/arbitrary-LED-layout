import type { AnyEffect } from "./effect";

export class EffectRegistry {
  private readonly effects = new Map<string, AnyEffect>();

  constructor(initial: Iterable<AnyEffect> = []) {
    for (const e of initial) this.register(e);
  }

  register(effect: AnyEffect): this {
    if (this.effects.has(effect.id)) throw new Error(`Effect "${effect.id}" is already registered`);
    this.effects.set(effect.id, effect);
    return this;
  }

  get(id: string): AnyEffect | undefined {
    return this.effects.get(id);
  }

  require(id: string): AnyEffect {
    const e = this.effects.get(id);
    if (!e) throw new Error(`Unknown effect "${id}"`);
    return e;
  }

  has(id: string): boolean {
    return this.effects.has(id);
  }

  list(): AnyEffect[] {
    return [...this.effects.values()];
  }
}
