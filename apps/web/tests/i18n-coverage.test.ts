import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { translate } from "../lib/translations";

// Brand and channel names that stay the same in every language.
const UNTRANSLATED = new Set(["TagWorks", "Instagram", "Instagram · 120"]);
const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test("every English UI string has ja, es, de and zh translations", () => {
  const missing: string[] = [];
  for (const file of [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "components")), ...sourceFiles(join(ROOT, "lib"))]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\b(?:tx|text\(locale,)\s*\(?\s*"((?:[^"\\]|\\.)*)",\s*"/g)) {
      const english = match[1];
      if (UNTRANSLATED.has(english) || !/[a-z]/i.test(english)) continue;
      // Some words (e.g. "Dashboard" in German) are legitimately identical in one language.
      const locales = ["ja", "es", "de", "zh"] as const;
      if (locales.every((locale) => translate(locale, english) === english)) missing.push(english);
    }
  }
  assert.deepEqual(missing, []);
});
