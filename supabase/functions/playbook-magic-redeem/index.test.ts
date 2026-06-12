import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const BASE = `${Deno.env.get("VITE_SUPABASE_URL")!}/functions/v1/playbook-magic-redeem`;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const headers = { apikey: ANON };

Deno.test("missing token returns 400 error page", async () => {
  const res = await fetch(BASE, { headers });
  assertEquals(res.status, 400);
  const html = await res.text();
  assertStringIncludes(html, "Ungültiger Link");
  assertStringIncludes(html, "<!doctype html>");
});

Deno.test("short token returns 400 error page", async () => {
  const res = await fetch(`${BASE}?token=abc`, { headers });
  assertEquals(res.status, 400);
  const html = await res.text();
  assertStringIncludes(html, "Ungültiger Link");
});

Deno.test("invalid token returns error page with Playbooks reference", async () => {
  const fakeToken = "aaaa1111bbbb2222cccc3333dddd4444";
  const res = await fetch(`${BASE}?token=${fakeToken}`, { headers, redirect: "manual" });
  // Should be 400 or 410, not 500
  const status = res.status;
  const html = await res.text();
  assertEquals(status < 500, true, `Expected client error, got ${status}`);
  assertStringIncludes(html, "<!doctype html>");
  // Verify the German special chars and the previously-breaking „Playbooks" string survive bundling
  assertStringIncludes(html, "Mitgliederbereich");
});

Deno.test("error pages contain fallback link", async () => {
  const res = await fetch(BASE, { headers });
  const html = await res.text();
  assertStringIncludes(html, "/members/playbooks/auszahlungspolitik");
});
