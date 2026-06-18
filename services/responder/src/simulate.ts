import type { Hex, ResponseAction, ResponsePlan } from "@pharos-incident/policy";

export interface SimResult {
  ok: boolean;
  postStateDigest: Hex;
  warnings: string[];
}

export interface SimulateFn {
  (action: ResponseAction): Promise<SimResult>;
}

export interface Simulator {
  simulate(plan: ResponsePlan, sim: SimulateFn): Promise<SimResult[]>;
}

export class DefaultSimulator implements Simulator {
  async simulate(plan: ResponsePlan, sim: SimulateFn): Promise<SimResult[]> {
    const out: SimResult[] = [];
    for (const a of plan.actions) {
      out.push(await sim(a));
    }
    return out;
  }
}
