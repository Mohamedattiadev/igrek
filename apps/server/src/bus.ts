import type { ServerMessage } from "@godeye/core";

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

  register(id: string, item: Stoppable): () => void {
    this.running.set(id, item);
    return () => this.running.delete(id);
  }

  async stopAll(): Promise<number> {
    const items = [...this.running.values()];
    this.running.clear();
    await Promise.allSettled(items.map((item) => item.stop()));
    return items.length;
  }
}
