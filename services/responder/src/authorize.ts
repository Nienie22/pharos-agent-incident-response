import type { Approval, Hex, ResponsePlan } from "@pharos-incident/policy";

export class Authorizer {
  private collected: Approval[] = [];

  submit(plan: ResponsePlan, approver: Hex, signature: Hex, now: number): void {
    if (now >= plan.expiresAt) throw new Error("PLAN_EXPIRED");
    if (plan.requiredApprovals === 0) throw new Error("PLAN_DOES_NOT_REQUIRE_APPROVALS");
    this.collected.push({
      planHash: plan.planHash,
      approver,
      expiresAt: plan.expiresAt,
      signature,
    });
  }

  isReady(plan: ResponsePlan): boolean {
    const unique = new Set(this.collected.filter((a) => a.planHash === plan.planHash).map((a) => a.approver.toLowerCase()));
    return unique.size >= plan.requiredApprovals;
  }

  approvalsFor(planHash: Hex): Approval[] {
    return this.collected.filter((a) => a.planHash === planHash);
  }
}
