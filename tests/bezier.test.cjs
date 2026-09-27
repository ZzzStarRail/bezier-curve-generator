"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const B = require("../src/bezier.js");
const cubic = [{ x: 1, y: 1 }, { x: 2, y: 5 }, { x: 7, y: 5 }, { x: 9, y: 1 }];
function near(a, b, tolerance = 1e-9) { assert.ok(Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance, `${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
function bernstein(points, t) {
  const n = points.length - 1;
  let coefficient = 1, x = 0, y = 0;
  points.forEach((p, i) => {
    if (i) coefficient *= (n - i + 1) / i;
    const weight = coefficient * (1 - t) ** (n - i) * t ** i;
    x += weight * p.x; y += weight * p.y;
  });
  return { x, y };
}
test("曲线精确通过首尾控制点", () => {
  assert.deepEqual(B.evaluate(cubic, 0), cubic[0]);
  assert.deepEqual(B.evaluate(cubic, 1), cubic.at(-1));
});
test("一次曲线与二次曲线的已知值", () => {
  near(B.evaluate([{ x: 0, y: 2 }, { x: 4, y: 6 }], 0.25), { x: 1, y: 3 });
  near(B.evaluate([{ x: 0, y: 0 }, { x: 2, y: 4 }, { x: 4, y: 0 }], 0.5), { x: 2, y: 2 });
});
test("1–31 次 de Casteljau 结果与独立 Bernstein 公式一致", () => {
  for (let count = 2; count <= 32; count++) {
    const points = Array.from({ length: count }, (_, i) => ({ x: Math.sin(i * 1.7) * 8, y: Math.cos(i * 2.3) * 13 }));
    for (const t of [0, 0.001, 0.17, 0.5, 0.79, 0.999, 1]) near(B.evaluate(points, t), bernstein(points, t));
  }
});
test("三次曲线的构造三角形有 4、3、2、1 个点", () => {
  const levels = B.levels(cubic, 0.35);
  assert.deepEqual(levels.map(row => row.length), [4, 3, 2, 1]);
  near(levels.at(-1)[0], B.evaluate(cubic, 0.35));
});
test("升阶保持整条曲线，且不修改输入", () => {
  const original = structuredClone(cubic), elevated = B.elevate(cubic);
  assert.equal(elevated.length, 5);
  for (let i = 0; i <= 100; i++) near(B.evaluate(cubic, i / 100), B.evaluate(elevated, i / 100));
  assert.deepEqual(cubic, original);
  for (const t of [0.01, 0.31, 0.6, 0.98]) near(B.evaluate(B.elevate(elevated), t), B.evaluate(cubic, t));
});
test("分割子曲线满足原曲线的参数重映射，包括端点分割", () => {
  for (const split of [0, 0.17, 0.5, 0.86, 1]) {
    const { left, right } = B.subdivide(cubic, split);
    near(left.at(-1), right[0]);
    for (const s of [0, 0.13, 0.5, 0.91, 1]) {
      near(B.evaluate(left, s), B.evaluate(cubic, s * split));
      near(B.evaluate(right, s), B.evaluate(cubic, split + s * (1 - split)));
    }
  }
});
test("导数满足端点公式与内部中心差分", () => {
  near(B.derivative(cubic, 0), { x: 3, y: 12 });
  near(B.derivative(cubic, 1), { x: 6, y: -12 });
  const h = 1e-5;
  for (const t of [0.1, 0.5, 0.9]) {
    const a = B.evaluate(cubic, t - h), b = B.evaluate(cubic, t + h);
    near(B.derivative(cubic, t), { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h) }, 1e-7);
  }
});
test("重合点的退化曲线与零导数不会产生 NaN", () => {
  const points = Array.from({ length: 32 }, () => ({ x: 3, y: -2 }));
  near(B.evaluate(points, 0.38), points[0]); near(B.derivative(points, 0.38), { x: 0, y: 0 });
});
test("仿射变换前后计算一致", () => {
  const transform = p => ({ x: 2 * p.x - p.y + 3, y: p.x + 4 * p.y - 7 });
  for (const t of [0, 0.23, 0.68, 1]) near(B.evaluate(cubic.map(transform), t), transform(B.evaluate(cubic, t)));
});
test("JSON 导入完整保留控制点和参数，并拒绝无效数据", () => {
  const data = { type: "bezier-curve", version: 1, points: cubic, t: 0.2 };
  assert.deepEqual(B.parseProject(JSON.parse(JSON.stringify(data))), { points: cubic, t: 0.2 });
  for (const invalid of [null, {}, { ...data, version: 2 }, { ...data, points: [cubic[0]] }, { ...data, points: Array(33).fill(cubic[0]) }, { ...data, t: "0.2" }, { ...data, t: -1 }, { ...data, t: NaN }, { ...data, points: [{ x: Infinity, y: 1 }, cubic[0]] }, { ...data, points: [{ x: "2", y: 1 }, cubic[0]] }, { ...data, points: [{ x: 1e7, y: 1 }, cubic[0]] }]) assert.throws(() => B.parseProject(invalid));
  assert.throws(() => B.elevate(Array(32).fill(cubic[0])));
  assert.throws(() => B.evaluate(cubic, 2));
});
