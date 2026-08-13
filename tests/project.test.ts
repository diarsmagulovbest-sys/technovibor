import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("finished site has product metadata and no starter preview", async () => {
  const [layout, page, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /ТехноВыбор/);
  assert.match(layout, /og\.png/);
  assert.match(page, /Ноутбук по делу/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});

test("admin import uses analyze, review, mapping, and commit stages", async () => {
  const source = await readFile(new URL("../app/admin/ImportAnalyzer.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/admin\/import\/analyze/);
  assert.match(source, /\/api\/admin\/import\/commit/);
  assert.match(source, /Результат анализа/);
  assert.match(source, /Сопоставление колонок/);
  assert.match(source, /Предупреждения/);
  assert.match(source, /analysisId/);
  assert.match(source, /originalFile/);
});
