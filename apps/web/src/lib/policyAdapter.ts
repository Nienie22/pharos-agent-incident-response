import {
  buildPlan as policyBuildPlan,
  computePlanHash,
  type BuildPlanInput,
  type ResponsePlan,
} from "@pharos-incident/policy";

export function buildPlan(input: BuildPlanInput): ResponsePlan {
  return policyBuildPlan(input);
}

export { computePlanHash };