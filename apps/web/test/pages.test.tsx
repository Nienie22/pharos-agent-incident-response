import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "../src/components/AppLayout.js";
import { HomePage } from "../src/pages/HomePage.js";
import { DashboardPage } from "../src/pages/DashboardPage.js";
import { IncidentsListPage } from "../src/pages/IncidentsListPage.js";
import { IncidentDetailPage } from "../src/pages/IncidentDetailPage.js";
import { DemoScenariosPage } from "../src/pages/DemoScenariosPage.js";
import { SettingsPage } from "../src/pages/SettingsPage.js";
import { ClientProvider } from "../src/lib/ClientContext.js";
import { WalletProvider } from "../src/lib/WalletContext.js";
import { freshDemoState, MockClient } from "../src/lib/MockClient.js";
import type { PharosIncidentClient } from "@pharos-incident/sdk";

function renderAt(initialPath: string, client?: PharosIncidentClient) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ClientProvider initialClient={client}>
        <WalletProvider>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="incidents" element={<IncidentsListPage />} />
              <Route path="incidents/:id" element={<IncidentDetailPage />} />
              <Route path="demo" element={<DemoScenariosPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </WalletProvider>
      </ClientProvider>
    </MemoryRouter>
  );
}

describe("web pages", () => {
  it("dashboard renders KPIs and seed incidents", () => {
    renderAt("/dashboard");
    expect(screen.getByTestId("dashboard-page")).toBeTruthy();
    expect(screen.getAllByTestId("incident-card").length).toBe(3);
    expect(screen.getByText(/incidents: 3/i)).toBeTruthy();
  });

  it("home page introduces the project and links to demo", () => {
    renderAt("/");
    expect(screen.getByTestId("home-page")).toBeTruthy();
    expect(screen.getByText(/Stop compromised agents/i)).toBeTruthy();
    expect(screen.getByTestId("home-open-demo")).toBeTruthy();
    const logo = screen.getByRole("img", { name: /Pharos Split Beacon/i });
    expect(logo.getAttribute("src")).toBe("/pharos-split-beacon.svg");
  });

  it("incidents list filters by severity", () => {
    renderAt("/incidents");
    expect(screen.getByTestId("incidents-page")).toBeTruthy();
    const select = screen.getByTestId("filter-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "CRITICAL" } });
    const rows = screen.queryAllByTestId("incident-row");
    expect(rows.length).toBe(2);
  });

  it("incident detail opens and runs propose", async () => {
    const state = freshDemoState();
    const client = new MockClient(state);
    const first = state.incidents[0];
    renderAt("/incidents/" + first.id, client);
    expect(screen.getByTestId("incident-detail")).toBeTruthy();
    fireEvent.click(screen.getByTestId("btn-propose"));
    await waitFor(() => expect(screen.getByTestId("btn-simulate")).toBeTruthy());
  });

  it("confirms a live wallet approval before incrementing the threshold", async () => {
    const state = freshDemoState();
    const client = new MockClient(state);
    const first = state.incidents[0];
    const account = "0x00000000000000000000000000000000000a71ce";
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_chainId") return "0xa8231";
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
        if (method === "personal_sign") return "0x" + "ab".repeat(65);
        if (method === "eth_sendTransaction") return "0x" + "cd".repeat(32);
        return null;
      },
      on: () => undefined,
      removeListener: () => undefined,
    };

    renderAt("/incidents/" + first.id, client);
    fireEvent.click(screen.getByTestId("btn-propose"));
    await waitFor(() => expect(screen.getByTestId("btn-approve-0")).toBeTruthy());
    fireEvent.click(screen.getByTestId("btn-approve-0"));
    await waitFor(() => expect(screen.getByTestId("approval-count").textContent).toContain("1/"));
    expect(document.body.textContent).toContain("Approval confirmed on Pharos Atlantic");
  });

  it("demo page can run a scenario end-to-end", async () => {
    renderAt("/demo");
    expect(screen.getByTestId("demo-checklist").textContent).toContain("Ready");
    expect(screen.getByTestId("demo-stepper").textContent).toContain("Detect incident");
    expect(screen.getByTestId("testnet-evidence").textContent).toContain("IncidentRegistry");
    expect(screen.getByTestId("what-happened").textContent).toContain("watcher");
    fireEvent.click(screen.getByTestId("btn-run-malicious-approval"));
    await waitFor(
      () => {
        if (!screen.queryByText(/Last successful run/i)) {
          throw new Error("guided run has not completed yet");
        }
      },
      { timeout: 12000, interval: 100 }
    );
    expect(screen.getByText(/Last successful run/i)).toBeTruthy();
  }, 15000);

  it("settings page reflects demo mode and can change api base", () => {
    renderAt("/settings");
    const input = screen.getByTestId("api-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "http://example.test" } });
    fireEvent.click(screen.getByTestId("btn-apply"));
    expect(screen.getByTestId("api-current").textContent).toContain("http://example.test");
    expect(screen.getByTestId("wallet-account").textContent).toContain("not connected");
  });
});
