import assert from "node:assert/strict";
import test from "node:test";
import { scaledSize } from "../lib/image-optimizer";
import { splitSelection } from "../lib/upload-selection";

const file = (name: string, type = "") => new File(["x"], name, { type });

test("splits HTML, images and unsupported files", () => {
  const result = splitSelection([
    file("index.html", "text/html"), file("a.png", "image/png"), file("b.JPG"), file("logo.svg", "image/svg+xml"),
    file("photo.heic"), file("style.css"), file(".DS_Store"), file("a.png", "image/png"),
  ]);
  assert.deepEqual(result.html.map((f) => f.name), ["index.html"]);
  assert.deepEqual(result.images.map((f) => f.name), ["a.png", "b.JPG", "a.png"]);
  assert.deepEqual(result.rejected.map((f) => f.name), ["logo.svg", "photo.heic"]);
  assert.deepEqual(result.duplicates, ["a.png"]);
});

test("resizes only images whose long edge exceeds 1920px", () => {
  assert.deepEqual(scaledSize(3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(scaledSize(1000, 4000), { width: 480, height: 1920 });
  assert.deepEqual(scaledSize(800, 600), { width: 800, height: 600 });
});
