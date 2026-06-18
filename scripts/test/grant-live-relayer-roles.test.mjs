import assert from "node:assert/strict";
import test from "node:test";
import { requiredRoleGrants } from "../grant-live-relayer-roles.mjs";

test("plans only missing relayer role grants", () => {
  const grants = requiredRoleGrants({
    controllerExecutor: false,
    registryReporter: true,
    registryExecutor: false,
  });
  assert.deepEqual(grants.map((grant) => grant.key), ["controllerExecutor", "registryExecutor"]);
  assert.equal(grants[0].contract, "controller");
  assert.equal(grants[1].contract, "registry");
});

test("plans no transactions when all roles already exist", () => {
  assert.deepEqual(requiredRoleGrants({
    controllerExecutor: true,
    registryReporter: true,
    registryExecutor: true,
  }), []);
});
