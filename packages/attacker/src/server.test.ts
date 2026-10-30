import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createAttackerServer } from "./server.ts";

const server = createAttackerServer();
let base = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

test("serves the trap page with an embedded victim frame", async () => {
  const res = await fetch(base);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  const body = await res.text();
  // The bait and the invisible frame are both present.
  assert.match(body, /景品を受け取る/);
  assert.match(body, /<iframe[^>]+class="victim-frame"/);
  assert.match(body, /\/account\?protection=none/);
});

test("unknown paths 404", async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
});
