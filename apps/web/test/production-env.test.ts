import { describe, expect, it } from "vitest";
import { loadEnv } from "vite";

describe("production environment", () => {
  it("targets the deployed API instead of a loopback address", () => {
    const env = loadEnv("production", process.cwd(), "VITE_");

    expect(env.VITE_API_URL).toBe("https://pharos-agent-incident-api.vercel.app");
  });
});
