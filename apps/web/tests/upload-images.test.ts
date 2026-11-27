import assert from "node:assert/strict";
import test from "node:test";
import { rewriteUploadedImages, sniffImageType, storageImageName } from "../lib/upload-images";

const images = new Map([
  ["a.png", "https://cdn.test/v1/01-a.webp"],
  ["hero.jpg", "https://cdn.test/v1/02-hero.webp"],
  ["icon.png", "https://cdn.test/v1/03-icon.png"],
]);

test("rewrites every supported local image reference", () => {
  const html = `<!doctype html><link rel="icon" href="./icon.png">
<style>.hero{background:url('images/hero.jpg')}</style>
<img src="images/a.png"><img src='./a.png'><img src=a.png>
<img srcset="a.png 1x, images/hero.jpg 2x">
<div style="background-image:url(hero.jpg)"></div>
<a href="page2.html">next</a><img src="https://example.com/x.png">`;
  const result = rewriteUploadedImages(html, images);
  assert.equal((result.html.match(/cdn\.test/g) ?? []).length, 8);
  assert.ok(result.html.includes(`href="page2.html"`));
  assert.ok(result.html.includes(`src="https://example.com/x.png"`));
  assert.deepEqual(result.missing, []);
  assert.equal(result.used.length, 3);
});

test("reports local images that were not uploaded", () => {
  const result = rewriteUploadedImages(`<img src="logo.png"><img src="a.png"><a href="doc.html">x</a>`, images);
  assert.deepEqual(result.missing, ["logo.png"]);
  assert.deepEqual(result.used, ["https://cdn.test/v1/01-a.webp"]);
});

test("leaves script property assignments alone", () => {
  const html = `<script>img.src = "a.png"</script>`;
  assert.equal(rewriteUploadedImages(html, images).html, html);
});

test("normalizes storage names and sniffs image types", () => {
  assert.equal(storageImageName(0, "내 사진 (1).PNG", "image/webp"), "01-1.webp");
  assert.equal(storageImageName(9, "Hero Shot.jpg", "image/jpeg"), "10-hero-shot.jpg");
  assert.equal(sniffImageType(new TextEncoder().encode("GIF89a......")), "image/gif");
  assert.equal(sniffImageType(new TextEncoder().encode("<svg></svg>")), null);
});
