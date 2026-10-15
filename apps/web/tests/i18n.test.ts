import assert from "node:assert/strict";
import test from "node:test";
import { LOCALE_TAGS, normalizeLocale, text } from "../lib/i18n";

test("defaults unknown and missing locale values to English", () => {
  assert.equal(normalizeLocale(undefined), "en");
  assert.equal(normalizeLocale("fr"), "en");
  assert.equal(normalizeLocale("ja"), "ja");
  assert.equal(normalizeLocale("es"), "es");
  assert.equal(normalizeLocale("de"), "de");
  assert.equal(normalizeLocale("zh"), "zh");
  assert.equal(normalizeLocale("ko"), "ko");
});

test("translates shared interface copy in every supported language", () => {
  assert.equal(text("en", "Start free", "무료로 시작하기"), "Start free");
  assert.equal(text("ko", "Start free", "무료로 시작하기"), "무료로 시작하기");
  assert.equal(text("ja", "Start free", "무료로 시작하기"), "無料で始める");
  assert.equal(text("es", "Start free", "무료로 시작하기"), "Empezar gratis");
  assert.equal(text("de", "Start free", "무료로 시작하기"), "Kostenlos starten");
  assert.equal(text("zh", "Start free", "무료로 시작하기"), "免费开始");
});

test("localizes dynamic ranges and provides locale-aware number tags", () => {
  assert.equal(text("ja", "Last 30 days", "최근 30일"), "過去30日間");
  assert.equal(text("es", "Last 30 days", "최근 30일"), "Últimos 30 días");
  assert.equal(text("de", "Last 30 days", "최근 30일"), "Letzte 30 Tage");
  assert.equal(text("zh", "Last 30 days", "최근 30일"), "最近 30 天");
  assert.equal(LOCALE_TAGS.ja, "ja-JP");
  assert.equal(LOCALE_TAGS.es, "es-ES");
  assert.equal(LOCALE_TAGS.de, "de-DE");
  assert.equal(LOCALE_TAGS.zh, "zh-CN");
});
