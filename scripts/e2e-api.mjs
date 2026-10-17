import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { createServerClient } from "@supabase/ssr";

const sql = postgres(process.env.SUPABASE_E2E_DATABASE_URL, { max: 1, prepare: false, ssl: "require" });
const ownerId = randomUUID();
const email = `tagworks-api-e2e-${randomBytes(12).toString("hex")}@example.invalid`;
const password = randomBytes(32).toString("base64url");
const site = process.env.TAGWORKS_E2E_SITE_URL ?? "http://localhost:3110";
const jar = new Map();
const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: { getAll: () => [...jar].map(([name,value]) => ({ name,value })), setAll: cookies => cookies.forEach(c => jar.set(c.name,c.value)) },
});
let seeded = false;
try {
  await sql`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values('00000000-0000-0000-0000-000000000000',${ownerId}::uuid,'authenticated','authenticated',${email},extensions.crypt(${password},extensions.gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}','{}',now(),now())`;
  seeded = true;
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(${ownerId},${ownerId}::uuid,jsonb_build_object('sub',${ownerId}::text,'email',${email}::text,'email_verified',true),'email',now(),now(),now())`;
  const { error } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  const headers = { Cookie: [...jar].map(([key,value]) => `${key}=${value}`).join("; "), Origin: site, "Content-Type": "application/json" };
  const created = await fetch(`${site}/api/keys`, { method: "POST", headers, body: JSON.stringify({ name: "Disposable E2E" }) });
  assert.equal(created.status,201,await created.clone().text());
  const key = await created.json();
  const bearer = { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" };
  const dashboard = await fetch(`${site}/dashboard/api-keys`, { headers });
  assert.equal(dashboard.status,200);
  assert.ok(!(await dashboard.text()).includes(key.token), "Dashboard must not expose the raw key");
  const source = '<!doctype html><html><head><script>globalThis.apiTest=true</script><link rel="stylesheet" href="https://example.invalid/style.css"></head><body><h1>API E2E</h1><a href="https://example.org">Link</a></body></html>';
  const deployed = await fetch(`${site}/api/v1/deploy`, { method: "POST", headers: bearer, body: JSON.stringify({ title: "API test", html: source }) });
  assert.equal(deployed.status,201,await deployed.clone().text());
  const deployment = await deployed.json();
  const [version] = await sql`select v.original_html,v.source_storage,v.sanitized_html from public.page_versions v join public.pages p on p.id=v.page_id where p.id=${deployment.page.id}::uuid and p.owner_id=${ownerId}::uuid`;
  assert.equal(version.original_html,source);
  assert.equal(version.source_storage,"database");
  assert.ok(version.sanitized_html.includes("<script>globalThis.apiTest=true</script>"));
  const publicPath = new URL(deployment.pathUrl);
  const publicPage = await fetch(new URL(publicPath.pathname, process.env.TAGWORKS_E2E_PUBLISHER_URL ?? "http://localhost:3111"));
  assert.equal(publicPage.status,200);
  const html = await publicPage.text();
  assert.ok(html.includes("API E2E") && html.includes("example.invalid/style.css"));
  assert.match(publicPage.headers.get("content-security-policy"),/sandbox.*allow-scripts/);
  const denied = await fetch(`${site}/api/v1/deploy`, { method: "POST", headers: bearer, body: JSON.stringify({ title: "Denied", html: source }) });
  assert.equal(denied.status,402);
  const mcpHeaders = { ...bearer, Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" };
  const rpc = async (method,params) => {
    const response = await fetch(`${site}/api/mcp`, { method: "POST", headers: mcpHeaders, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    assert.equal(response.status,200,await response.clone().text()); return response.json();
  };
  assert.equal((await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "e2e", version: "1" } })).result.serverInfo.name,"tagworks");
  assert.equal((await rpc("tools/list")).result.tools.length,2);
  assert.equal((await rpc("tools/call", { name: "get_upload_allowance", arguments: {} })).result.structuredContent.canUpload,false);
  await sql`update public.billing_accounts set is_super_admin=true where owner_id=${ownerId}::uuid`;
  const tool = await rpc("tools/call", { name: "deploy_html", arguments: { title: "MCP test", html: source } });
  assert.equal(tool.result.isError,false,JSON.stringify(tool));
  assert.ok(tool.result.structuredContent.publicUrl);
  const revoke = await fetch(`${site}/api/keys`, { method: "DELETE", headers, body: JSON.stringify({ id: key.id }) });
  assert.equal(revoke.status,204);
  const revoked = await fetch(`${site}/api/v1/deploy`, { method: "POST", headers: bearer, body: "{}" });
  assert.equal(revoked.status,401);
  console.log("API E2E passed: key management, private originals, live publication, quota denial, MCP deploy, admin exemption, revocation.");
} finally {
  if (seeded) {
    // Remove only this script's disposable identity and its cascading test data.
    await sql`delete from public.pages where owner_id=${ownerId}::uuid`;
    await sql`delete from auth.users where id=${ownerId}::uuid`;
  }
  await sql.end({ timeout: 5 });
}
