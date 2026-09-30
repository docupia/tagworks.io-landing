import assert from "node:assert/strict";
import test from "node:test";

import { contentSecurityPolicy } from "../app/p/[slug]/route";

test("runs original scripts and external CSS inside an opaque-origin sandbox", () => {
  const policy = contentSecurityPolicy("platform-nonce", true);

  assert.match(policy, /script-src [^;]*https:/);
  assert.match(policy, /script-src [^;]*'unsafe-inline'/);
  assert.match(policy, /script-src-attr 'unsafe-inline'/);
  assert.match(policy, /style-src [^;]*https: [^;]*'unsafe-inline'/);
  assert.match(policy, /connect-src [^;]*https: wss:/);
  assert.match(policy, /sandbox [^;]*allow-scripts/);
  assert.doesNotMatch(policy, /allow-same-origin/);
});

test("keeps legacy sanitized pages on nonce-only scripts", () => {
  const policy = contentSecurityPolicy("platform-nonce", false);

  assert.match(policy, /script-src 'nonce-platform-nonce'/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.doesNotMatch(policy, /script-src [^;]*'unsafe-inline'/);
});
