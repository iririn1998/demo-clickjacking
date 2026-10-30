import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { createVictimServer } from "./server.ts";
import { resetAccount } from "./store.ts";

const server = createVictimServer();
let base = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  resetAccount();
});

const extractSid = (res: Response): string | undefined => {
  for (const cookie of res.headers.getSetCookie()) {
    const match = /^sid=([^;]+)/.exec(cookie);
    if (match && match[1]) return match[1];
  }
  return undefined;
};

const login = async (): Promise<string> => {
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "alice", password: "password123" }),
    redirect: "manual",
  });
  assert.equal(res.status, 303);
  const sid = extractSid(res);
  assert.ok(sid, "login should set a session cookie");
  return sid;
};

const status = async () => {
  const res = await fetch(`${base}/api/status`);
  return (await res.json()) as {
    exists: boolean;
    deletedAt: string | null;
    deleteCount: number;
    loggedIn: boolean;
  };
};

test("rejects wrong credentials", async () => {
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "alice", password: "nope" }),
    redirect: "manual",
  });
  assert.equal(res.status, 401);
  assert.equal(extractSid(res), undefined);
});

test("account page requires a session", async () => {
  const res = await fetch(`${base}/account`);
  const body = await res.text();
  assert.match(body, /先にログインしてください/);
  assert.doesNotMatch(body, /退会する/);
});

test("logged-in account page shows the withdraw button", async () => {
  const sid = await login();
  const res = await fetch(`${base}/account`, { headers: { cookie: `sid=${sid}` } });
  const body = await res.text();
  assert.match(body, /退会する（アカウント削除）/);
});

test("withdraw deletes the account and clears the session", async () => {
  const sid = await login();
  assert.equal((await status()).exists, true);

  const res = await fetch(`${base}/account/delete`, {
    method: "POST",
    headers: { cookie: `sid=${sid}` },
    redirect: "manual",
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /退会が完了しました/);

  const afterDelete = await status();
  assert.equal(afterDelete.exists, false);
  assert.equal(afterDelete.deleteCount, 1);
  assert.ok(afterDelete.deletedAt);

  // The session is now dead: the account page no longer trusts the old cookie.
  const reuse = await fetch(`${base}/account`, { headers: { cookie: `sid=${sid}` } });
  assert.match(await reuse.text(), /先にログインしてください/);
});

test("withdraw without a session cannot delete", async () => {
  const res = await fetch(`${base}/account/delete`, { method: "POST", redirect: "manual" });
  assert.equal(res.status, 401);
  assert.equal((await status()).exists, true);
});

test("protection=none sends no framing headers (vulnerable)", async () => {
  const sid = await login();
  const res = await fetch(`${base}/account?protection=none`, {
    headers: { cookie: `sid=${sid}` },
  });
  await res.text();
  assert.equal(res.headers.get("x-frame-options"), null);
  assert.equal(res.headers.get("content-security-policy"), null);
});

test("protection modes send the right framing headers", async () => {
  const sid = await login();

  const deny = await fetch(`${base}/account?protection=xfo-deny`, {
    headers: { cookie: `sid=${sid}` },
  });
  await deny.text();
  assert.equal(deny.headers.get("x-frame-options"), "DENY");

  const sameorigin = await fetch(`${base}/account?protection=xfo-sameorigin`, {
    headers: { cookie: `sid=${sid}` },
  });
  await sameorigin.text();
  assert.equal(sameorigin.headers.get("x-frame-options"), "SAMEORIGIN");

  const csp = await fetch(`${base}/account?protection=csp`, {
    headers: { cookie: `sid=${sid}` },
  });
  await csp.text();
  assert.equal(csp.headers.get("content-security-policy"), "frame-ancestors 'none'");
});

test("reset restores a deleted account", async () => {
  const sid = await login();
  await fetch(`${base}/account/delete`, {
    method: "POST",
    headers: { cookie: `sid=${sid}` },
    redirect: "manual",
  });
  assert.equal((await status()).exists, false);

  const res = await fetch(`${base}/api/reset`, { method: "POST" });
  assert.equal(res.status, 200);
  assert.equal((await status()).exists, true);
});
