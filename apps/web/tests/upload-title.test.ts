import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveUploadTitle,
  extractHeadTitle,
  titleFromHtmlFileName,
} from "../lib/upload-title";

test("extracts and normalizes only the document head title", () => {
  const source = `<!doctype html>
    <html>
      <head><title>  가을 &amp; 겨울\n 캠페인  </title></head>
      <body>
        <svg><title>브랜드 로고</title></svg>
        <title>본문 제목</title>
      </body>
    </html>`;

  assert.equal(extractHeadTitle(source), "가을 & 겨울 캠페인");
});

test("does not treat SVG or body titles as a document title", () => {
  assert.equal(
    extractHeadTitle("<html><body><svg><title>Logo</title></svg><title>Body</title></body></html>"),
    null,
  );
  assert.equal(
    extractHeadTitle("<html><head><svg><title>Head logo</title></svg></head><body></body></html>"),
    null,
  );
});

test("uses a clean filename when a document has no head title", () => {
  assert.equal(titleFromHtmlFileName("launch-page.HTML"), "launch-page");
  assert.equal(
    deriveUploadTitle("<html><head></head><body>Campaign</body></html>", "autumn-sale.htm"),
    "autumn-sale",
  );
});

test("limits automatically derived titles to the upload title limit", () => {
  const longTitle = "가".repeat(120);
  assert.equal(
    deriveUploadTitle(`<html><head><title>${longTitle}</title></head></html>`, "fallback.html").length,
    100,
  );
});
