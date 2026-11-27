import assert from "node:assert/strict";
import test from "node:test";
import { preferredLanguage, renderClosedPage } from "../lib/closed-page";

test("closed page follows the visitor's language", () => {
  assert.equal(preferredLanguage("ko-KR,ko;q=0.9,en;q=0.8"), "ko");
  assert.equal(preferredLanguage("fr-FR,de;q=0.8"), "de");
  assert.equal(preferredLanguage(null), "en");
  assert.ok(renderClosedPage("ja").includes("非公開"));
  assert.ok(!renderClosedPage("en").includes("<script"));
});
