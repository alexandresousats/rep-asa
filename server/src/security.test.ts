import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionCookieSecure } from "./cookie";

process.env.DATABASE_URL ??= "postgresql://asa:asa@127.0.0.1:5433/asa";
process.env.DEMAND_LINK_SECRET ??= "test-secret-test-secret-test-secret-12";

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

test("TTL do link de demanda é configurável e o padrão é 7 dias", async () => {
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

    delete process.env.DEMAND_LINK_TTL;
    const now = Date.now();
    const ttl = links.demandLinkTtlMs();
    const fresh = links.signDemandLink({
      wId: "ws",
      pId: "proj",
      adminId: "u",
      adminName: "Ana",
      iat: now,
      exp: now + ttl,
    });
    const payload = links.parseAndVerifyDemandLink(fresh);
    assert.ok(payload);
    assert.equal(payload.exp, now + ttl);

    const expired = links.signDemandLink({
      wId: "ws",
      pId: "proj",
      adminId: "u",
      adminName: "Ana",
      iat: now - 10_000,
      exp: now - 1000,
    });
    assert.equal(links.parseAndVerifyDemandLink(expired), null);

    process.env.DEMAND_LINK_TTL = "1h";
    const tooLong = links.signDemandLink({
      wId: "ws",
      pId: "proj",
      adminId: "u",
      adminName: "Ana",
      iat: now,
      exp: now + 2 * 60 * 60 * 1000,
    });
    assert.equal(links.parseAndVerifyDemandLink(tooLong), null);
  } finally {
    if (previous === undefined) delete process.env.DEMAND_LINK_TTL;
    else process.env.DEMAND_LINK_TTL = previous;
  }
});
