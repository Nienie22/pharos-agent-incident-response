import type { Hex, ResponseAction } from "@pharos-incident/policy";

export interface QueueState {
  pending: Map<number, ResponseAction>;
  executed: Set<Hex>;
}

export class NonceQueue {
  private state: QueueState = { pending: new Map(), executed: new Set() };
  private nextNonce = 0;

  enqueue(action: ResponseAction, nonce: number): void {
    if (this.state.pending.has(nonce)) throw new Error("NONCE_COLLISION");
    this.state.pending.set(nonce, action);
  }

  markExecuted(planHash: Hex, nonce: number): void {
    this.state.pending.delete(nonce);
    this.state.executed.add(planHash);
  }

  pullNonce(): number {
    const n = this.nextNonce;
    this.nextNonce += 1;
    return n;
  }

  hasExecuted(planHash: Hex): boolean {
    return this.state.executed.has(planHash);
  }
}
