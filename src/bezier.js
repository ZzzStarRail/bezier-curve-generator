(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BezierMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_POINTS = 32;
  const MAX_COORDINATE = 1e6;
  const copy = p => ({ x: p.x, y: p.y });
  const mix = (a, b, t) => ({ x: (1 - t) * a.x + t * b.x, y: (1 - t) * a.y + t * b.y });

  function validatePoints(points, minimum = 2) {
    if (!Array.isArray(points) || points.length < minimum || points.length > MAX_POINTS) {
      throw new Error(`控制点数量须为 ${minimum}–${MAX_POINTS} 个。`);
    }
    return points.map((p, i) => {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number" ||
          !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
          Math.abs(p.x) > MAX_COORDINATE || Math.abs(p.y) > MAX_COORDINATE) {
        throw new Error(`P${i} 的坐标须为有限数，绝对值不超过 ${MAX_COORDINATE}。`);
      }
      return copy(p);
    });
  }

  function checkParameter(t) {
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error("参数 t 须在 0 与 1 之间。");
  }

  // The complete de Casteljau triangle, starting with the original polygon.
  function levels(points, t) {
    checkParameter(t);
    if (!points.length) throw new Error("至少需要一个点。");
    const result = [points.map(copy)];
    while (result[result.length - 1].length > 1) {
      const previous = result[result.length - 1];
      result.push(previous.slice(1).map((p, i) => mix(previous[i], p, t)));
    }
    return result;
  }

  function evaluate(points, t) {
    checkParameter(t);
    if (!points.length) throw new Error("至少需要一个点。");
    const work = points.map(copy);
    for (let count = work.length - 1; count > 0; count--) {
      for (let i = 0; i < count; i++) work[i] = mix(work[i], work[i + 1], t);
    }
    return work[0];
  }

  function derivative(points, t) {
    checkParameter(t);
    const n = points.length - 1;
    if (n < 1) return { x: 0, y: 0 };
    const differences = points.slice(1).map((p, i) => ({
      x: n * (p.x - points[i].x), y: n * (p.y - points[i].y)
    }));
    return evaluate(differences, t);
  }

  function elevate(points) {
    if (points.length >= MAX_POINTS) throw new Error(`最多支持 ${MAX_POINTS} 个控制点。`);
    const denominator = points.length;
    return [copy(points[0]), ...points.slice(1).map((p, i) =>
      mix(p, points[i], (i + 1) / denominator)), copy(points[points.length - 1])];
  }

  function subdivide(points, t) {
    const triangle = levels(points, t);
    return {
      left: triangle.map(row => copy(row[0])),
      right: triangle.map(row => copy(row[row.length - 1])).reverse()
    };
  }

  function parseProject(data) {
    if (!data || data.type !== "bezier-curve" || data.version !== 1) {
      throw new Error("这不是受支持的贝塞尔曲线文件（type / version 不匹配）。");
    }
    const points = validatePoints(data.points);
    const t = data.t === undefined ? 0.35 : data.t;
    checkParameter(t);
    return { points, t };
  }

  return { MAX_POINTS, MAX_COORDINATE, mix, validatePoints, levels, evaluate, derivative, elevate, subdivide, parseProject };
});
