import type { ServerMessage } from "@igrek/core";

type Listener = (message: ServerMessage) => void;

/** In-process pub/sub that fans server events out to every open WebSocket. */
export class Bus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(message: ServerMessage): void {
    for (const listener of this.listeners) listener(message);
  }
}

type Stoppable = { label: string; stop: () => void | Promise<void> };

/**
 * Everything that runs on its own (agents, scheduled jobs, remote commands)
 * registers here so the emergency stop button can halt it.
 */
export class StopRegistry {
  private running = new Map<string, Stoppable>();
  /** How many things run now, after each change: the stop button shows only while there is one. */
  onChange: (count: number) => void = () => undefined;

  count(): number {
    return this.running.size;
  }

  register(id: string, item: Stoppable): () => void {
    this.running.set(id, item);
    this.onChange(this.running.size);
    return () => {
      if (this.running.get(id) === item && this.running.delete(id)) this.onChange(this.running.size);
    };
  }

  /** Stops one registered item (e.g. "Stop" on a running test). */
  async stop(id: string): Promise<boolean> {
    const item = this.running.get(id);
    if (!item) return false;
    this.running.delete(id);
    this.onChange(this.running.size);
    await item.stop();
    return true;
  }

  async stopAll(): Promise<number> {
    const items = [...this.running.values()];
    this.running.clear();
    this.onChange(0);
    await Promise.allSettled(items.map((item) => item.stop()));
    return items.length;
  }
}
