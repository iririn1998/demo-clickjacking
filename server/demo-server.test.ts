// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createDemoServer } from "./demo-server.ts";

const server = createDemoServer();
const observerOrigin = "http://127.0.0.1:5173";
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

const openAccount = async (mode = "none") => {
  const response = await fetch(`${baseUrl}/account?protection=${mode}`);
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  const html = await response.text();
  const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)![1]!;
  return { response, cookie, csrf, html };
};

const readState = async (cookie: string) => {
  const response = await fetch(`${baseUrl}/api/state`, {
    headers: { Cookie: cookie, Origin: observerOrigin },
  });
  return response.json() as Promise<{
    isPublic: boolean;
    publications: number;
    lastChanged: string | null;
  }>;
};

const publish = (cookie: string, csrf: string, origin = baseUrl) =>
  fetch(`${baseUrl}/publish`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ csrf }),
  });

describe("local victim service", () => {
  it.each([
    ["none", null, null],
    ["csp", "frame-ancestors 'none'", null],
    ["deny", null, "DENY"],
    ["sameorigin", null, "SAMEORIGIN"],
  ])("returns real framing headers for %s", async (mode, csp, xfo) => {
    const { response } = await openAccount(mode!);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(csp);
    expect(response.headers.get("x-frame-options")).toBe(xfo);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("changes server state only through the authenticated victim form", async () => {
    const { cookie, csrf } = await openAccount();
    expect(await readState(cookie)).toEqual({
      isPublic: false,
      publications: 0,
      lastChanged: null,
    });
    expect((await publish(cookie, csrf)).status).toBe(303);
    expect(await readState(cookie)).toMatchObject({ isPublic: true, publications: 1 });
    expect((await readState(cookie)).lastChanged).toEqual(expect.any(String));
  });

  it("rejects forged CSRF tokens and direct submissions from the trap origin", async () => {
    const { cookie, csrf } = await openAccount();
    expect((await publish(cookie, "wrong-token")).status).toBe(403);
    expect((await publish(cookie, csrf, observerOrigin)).status).toBe(403);
    expect((await readState(cookie)).isPublic).toBe(false);
  });

  it("isolates browser sessions and invalidates old forms on reset", async () => {
    const first = await openAccount();
    const second = await openAccount();
    await publish(first.cookie, first.csrf);
    expect((await readState(second.cookie)).isPublic).toBe(false);
    const reset = await fetch(`${baseUrl}/api/reset`, {
      method: "POST",
      headers: { Cookie: first.cookie, Origin: observerOrigin },
    });
    expect(reset.status).toBe(204);
    expect(await readState(first.cookie)).toEqual({
      isPublic: false,
      publications: 0,
      lastChanged: null,
    });
    expect((await publish(first.cookie, first.csrf)).status).toBe(403);
  });

  it("restricts observation/reset CORS access to the demo UI", async () => {
    const { cookie } = await openAccount();
    const allowed = await fetch(`${baseUrl}/api/state`, {
      headers: { Cookie: cookie, Origin: observerOrigin },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(observerOrigin);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(await allowed.json()).not.toHaveProperty("csrf");
    for (const path of ["/api/state", "/api/reset"]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: path.endsWith("reset") ? "POST" : "GET",
        headers: { Cookie: cookie, Origin: "http://unrelated.invalid" },
      });
      expect(response.status).toBe(404);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});
