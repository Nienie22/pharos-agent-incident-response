import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommandCenter } from "../src/components/CommandCenter.js";
import type { PharosIncidentClient } from "@pharos-incident/sdk";
import type { ResponsePlan } from "@pharos-incident/policy";

const plan = {
  incidentId: "0x" + "11".repeat(32),
  chainId: 1,
  actions: [{
    kind: "PAUSE_AGENT",
    target: "0x" + "22".repeat(20),
    calldata: "0x" + "33".repeat(8),
    value: 0n,
    reasonHash: "0x" + "44".repeat(32),
  }],
  expiresAt: Date.now() + 60000,
  requiredApprovals: 1,
  planHash: "0x" + "55".repeat(32),
};

function client(over = {}) {
  return {
    detect: vi.fn(),
    triage: vi.fn(async () => ({ severity: "HIGH", score: 200 })),
    propose: vi.fn(async () => plan),
    simulate: vi.fn(),
    approve: vi.fn(async () => ({ ready: true })),
    execute: vi.fn(async () => ({ txHash: "0x" + "66".repeat(32) })),
    verify: vi.fn(),
    close: vi.fn(),
    ...over,
  };
}

describe("CommandCenter", () => {
  it("shows the plan after clicking Load plan", async () => {
    render(<CommandCenter client={client()} />);
    fireEvent.click(screen.getByText("Load plan"));
    await waitFor(() => expect(screen.getByText(/Plan 0x55555555/)).toBeTruthy());
  });

  it("disables the Approve button while busy", async () => {
    const c = client({ approve: vi.fn(async () => ({ ready: false })) });
    render(<CommandCenter client={c} />);
    fireEvent.click(screen.getByText("Load plan"));
    await waitFor(() => screen.getByText("Approve"));
    const btn = screen.getByText("Approve");
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("displays wrong-network banner when txHash is empty", async () => {
    const c = client({ execute: vi.fn(async () => ({ txHash: "0x" })) });
    render(<CommandCenter client={c} />);
    fireEvent.click(screen.getByText("Load plan"));
    await waitFor(() => screen.getByText("Execute"));
    fireEvent.click(screen.getByText("Execute"));
    await waitFor(() => expect(screen.getByRole("alert").getAttribute("data-status")).toBe("wrong-network"));
  });

  it("shows service-offline banner when triage fails", async () => {
    const c = client({ triage: vi.fn(async () => { throw new Error("down"); }) });
    render(<CommandCenter client={c} />);
    await waitFor(() => expect(screen.getByRole("alert").getAttribute("data-status")).toBe("service-offline"));
  });
});
