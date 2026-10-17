import assert from "node:assert/strict";
import test from "node:test";
import { generateApiKey, hashApiKey, parseApiKey } from "../lib/api-key-token";
import { readJsonBody, ApiError } from "../lib/api-http";
import { validateDeploymentInput } from "../lib/deployment-input";
import { publicationUrls } from "../lib/publication-url";
import { handleMcpMessage } from "../lib/mcp";

test("API keys have 256-bit random secrets and hashes never contain the bearer token", () => {
  const key = generateApiKey();
  assert.match(key.token, /^tw_live_[0-9a-f]{64}$/);
  assert.equal(key.prefix.length, 16);
  assert.equal(key.hash, hashApiKey(key.token));
  assert.notEqual(key.token, generateApiKey().token);
  assert.equal(parseApiKey(`Bearer ${key.token}`), key.token);
  assert.equal(parseApiKey(`Bearer ${key.token} extra`), null);
  assert.equal(parseApiKey(null), null);
});
test("deploy input rejects owner injection, invalid types and excessive UTF-8 bytes", () => {
  const input = { html: "<h1>안녕</h1>", title: " Example " };
  assert.equal(validateDeploymentInput(input).title, "Example");
  assert.equal(validateDeploymentInput(input).html, input.html);
  assert.throws(() => validateDeploymentInput({ ...input, ownerId: "another-user" }));
  assert.throws(() => validateDeploymentInput({ ...input, title: null }));
  assert.throws(() => validateDeploymentInput({ ...input, description: 1 }));
  assert.throws(() => validateDeploymentInput({ ...input, html: `<p>${"한".repeat(400000)}</p>` }), error => error instanceof ApiError && error.status === 413);
});
test("JSON reader limits chunked bodies with no content-length", async () => {
  const request = new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: "x".repeat(500) }) });
  await assert.rejects(readJsonBody(request, 100), error => error instanceof ApiError && error.status === 413);
});
test("publication URLs default to existing links and enable configured subdomains", () => {
  assert.equal(publicationUrls("page-a", "https://publisher.example").publicUrl, "https://publisher.example/p/page-a");
  assert.equal(publicationUrls("page-a", "https://publisher.example", "pages.example.net").publicUrl, "https://page-a.pages.example.net");
  assert.throws(() => publicationUrls("page-a", "https://publisher.example", "https://bad/path"));
});
test("MCP discovers tools, negotiates supported versions, and does not execute notification tools", async () => {
  let calls = 0;
  const dependencies = { deploy: async () => { calls++; return { publicUrl: "https://example.com" }; }, allowance: async () => ({ canUpload: true }) };
  const initialize = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "test", version: "1" } } }, dependencies);
  assert.equal((initialize as { result: { protocolVersion: string } }).result.protocolVersion, "2025-11-25");
  const list = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, dependencies);
  assert.equal((list as { result: { tools: unknown[] } }).result.tools.length, 2);
  assert.equal(await handleMcpMessage({ jsonrpc: "2.0", method: "tools/call", params: { name: "deploy_html", arguments: {} } }, dependencies), null);
  assert.equal(calls, 0);
  await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "deploy_html", arguments: {} } }, dependencies);
  assert.equal(calls, 1);
  const bad = await handleMcpMessage([], dependencies);
  assert.equal((bad as { error: { code: number } }).error.code, -32600);
});
test("MCP tool errors do not leak server internals", async () => {
  const value = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "deploy_html" } }, { deploy: async () => { throw new Error("secret connection string"); }, allowance: async () => ({}) });
  assert.ok(!JSON.stringify(value).includes("secret"));
  assert.equal((value as { result: { isError: boolean } }).result.isError, true);
});
