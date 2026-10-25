import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import { sessionCookieSecure } from "./cookie";
import { ApiError } from "./errors";
import { AGENT_URL_BLOCKED, assertPublicHttpUrl, fetchPublic } from "./net";

process.env.DATABASE_URL ??= "postgresql://asa:asa@127.0.0.1:5433/asa";
process.env.DEMAND_LINK_SECRET ??= "test-secret-test-secret-test-secret-12";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function isBlocked(error: unknown) {
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 400);
  assert.equal(error.message, AGENT_URL_BLOCKED);
  return true;
}

const blockedUrls = [
  "http://127.0.0.1/v1",
  "http://127.0.0.1:11434/v1",
  "http://localhost/v1",
  "http://localhost./v1",
  "http://169.254.169.254/latest/meta-data",
  "http://10.0.0.1/",
  "http://192.168.1.20/",
  "http://172.16.0.5/",
  "http://0.0.0.0/",
  "http://[::1]/",
  "http://[::ffff:127.0.0.1]/",
  "http://0x7f000001/",
  "http://2130706433/",
  "http://0177.0.0.1/",
  "http://metadata.google.internal/computeMetadata/v1/",
  "http://127.0.0.1.nip.io/v1",
  "http://169.254.169.254.nip.io/latest/meta-data",
  "file:///etc/passwd",
  "http://user:pass@example.com/v1",
  "gopher://example.com/",
];

for (const url of blockedUrls) {
  test(`bloqueia ${url}`, async () => {
    await assert.rejects(() => assertPublicHttpUrl(url), isBlocked);
  });
}

test("permite host público", async () => {
  const url = await assertPublicHttpUrl("https://example.com/v1");
  assert.equal(url.hostname, "example.com");
});

test("não busca URL interna", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("no");
  };
  await assert.rejects(() => fetchPublic("http://169.254.169.254/latest/meta-data"), isBlocked);
  assert.equal(called, false);
});

test("não segue redirect para metadados", async () => {
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    seen.push(String(input));
    assert.equal(init?.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    });
  };
  await assert.rejects(
    () =>
      fetchPublic("https://example.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: "{}",
      }),
    isBlocked,
  );
  assert.deepEqual(seen, ["https://example.com/v1/chat/completions"]);
});

test("não segue redirect para host que resolve em IP interno", async () => {
  const seen: string[] = [];
  globalThis.fetch = async (input) => {
    seen.push(String(input));
    return new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254.nip.io/latest/meta-data" },
    });
  };
  await assert.rejects(() => fetchPublic("https://example.com/v1/chat/completions"), isBlocked);
  assert.deepEqual(seen, ["https://example.com/v1/chat/completions"]);
});

test("revalida cada salto e para antes do IP interno", async () => {
  const seen: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("example.com")) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.org/v1/chat/completions" },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { location: "http://10.0.0.8/latest" },
    });
  };
  await assert.rejects(() => fetchPublic("https://example.com/v1/chat/completions"), isBlocked);
  assert.deepEqual(seen, [
    "https://example.com/v1/chat/completions",
    "https://example.org/v1/chat/completions",
  ]);
});

test("segue redirect público e não reenvia a chave para outro host", async () => {
  const seen: { url: string; authorization: string | null; method: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    seen.push({
      url,
      authorization: headers.get("authorization"),
      method: (init?.method ?? "GET").toUpperCase(),
    });
    if (url.includes("example.com")) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.org/v1/chat/completions" },
      });
    }
    return new Response("ok", { status: 200 });
  };
  const response = await fetchPublic("https://example.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer secret", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.deepEqual(seen, [
    {
      url: "https://example.com/v1/chat/completions",
      authorization: "Bearer secret",
      method: "POST",
    },
    {
      url: "https://example.org/v1/chat/completions",
      authorization: null,
      method: "GET",
    },
  ]);
});

test("cookie Secure é padrão em produção e aceita override", () => {
  assert.equal(sessionCookieSecure({ NODE_ENV: "production" }), true);
  assert.equal(sessionCookieSecure({ NODE_ENV: "development" }), false);
  assert.equal(sessionCookieSecure({ NODE_ENV: "test" }), false);
  assert.equal(sessionCookieSecure({}), false);
  assert.equal(sessionCookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "0" }), false);
  assert.equal(sessionCookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "false" }), false);
  assert.equal(sessionCookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "1" }), true);
  assert.equal(sessionCookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "true" }), true);
});

test("TTL do link de demanda", async () => {
  const links = await import("./demand-links");
  const previous = process.env.DEMAND_LINK_TTL;
  try {
    delete process.env.DEMAND_LINK_TTL;
    assert.equal(links.demandLinkTtlMs(), 7 * 24 * 60 * 60 * 1000);

    process.env.DEMAND_LINK_TTL = "12h";
    assert.equal(links.demandLinkTtlMs(), 12 * 60 * 60 * 1000);

    process.env.DEMAND_LINK_TTL = "2d";
    assert.equal(links.demandLinkTtlMs(), 2 * 24 * 60 * 60 * 1000);

    process.env.DEMAND_LINK_TTL = "90d";
    assert.equal(links.demandLinkTtlMs(), 30 * 24 * 60 * 60 * 1000);

    process.env.DEMAND_LINK_TTL = "604800";
    assert.equal(links.demandLinkTtlMs(), 604800 * 1000);

    process.env.DEMAND_LINK_TTL = "não";
    assert.equal(links.demandLinkTtlMs(), 7 * 24 * 60 * 60 * 1000);

    const now = Date.now();
    delete process.env.DEMAND_LINK_TTL;
    const token = links.signDemandLink({
      wId: "ws",
      pId: "proj",
      adminId: "u",
      adminName: "Ana",
      iat: now,
    });
    const payload = links.parseAndVerifyDemandLink(token);
    assert.ok(payload);
    assert.ok(Math.abs((payload.exp ?? 0) - (now + 7 * 24 * 60 * 60 * 1000)) < 2000);
    assert.equal(links.demandLinkIsCurrent(payload, now), true);
    assert.equal(links.demandLinkIsCurrent(payload, now + 8 * 24 * 60 * 60 * 1000), false);

    const expired = links.signDemandLink({
      wId: "ws",
      pId: "proj",
      adminId: "u",
      adminName: "Ana",
      iat: now - 10_000,
      exp: now - 1000,
    });
    const expiredPayload = links.parseAndVerifyDemandLink(expired);
    assert.ok(expiredPayload);
    assert.equal(links.demandLinkIsCurrent(expiredPayload), false);

    const legacy = Buffer.from(
      JSON.stringify({
        wId: "ws",
        pId: "proj",
        adminId: "u",
        adminName: "Ana",
        iat: now,
      }),
    ).toString("base64url");
    const secret = process.env.DEMAND_LINK_SECRET as string;
    const sig = createHmac("sha256", secret).update(legacy).digest("base64url");
    const legacyPayload = links.parseAndVerifyDemandLink(`${legacy}.${sig}`);
    assert.ok(legacyPayload);
    assert.equal(legacyPayload.exp, undefined);
    assert.equal(links.demandLinkIsCurrent(legacyPayload), false);
  } finally {
    if (previous === undefined) delete process.env.DEMAND_LINK_TTL;
    else process.env.DEMAND_LINK_TTL = previous;
  }
});
