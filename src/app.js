(() => {
  "use strict";
  const M = window.BezierMath;
  const $ = id => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const STORAGE_KEY = "bezier-lab.project.v1";
  const svg = $("canvas");
  const state = { points: [{ x: 1, y: 1 }, { x: 2, y: 5 }, { x: 7, y: 5 }, { x: 9, y: 1 }], t: 0.35, selected: 0 };
  let plot, world, drag = null, saveTimer;
  const copyPoints = () => state.points.map(p => ({ ...p }));
  const editable = value => Number(value.toPrecision(12)).toString();
  const rounded = value => Math.max(-M.MAX_COORDINATE, Math.min(M.MAX_COORDINATE, Number(value.toFixed(3))));
  const numberText = value => Math.abs(value) < 1e-10 ? "0" : Number(value.toPrecision(10)).toString();

  function node(tag, attributes = {}, text) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function error(message = "") { $("error").textContent = message; $("error").hidden = !message; }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: "bezier-curve", version: 1, points: state.points, t: state.t })); }
      catch (_) { /* Local-file storage can be unavailable; editing still works. */ }
    }, 200);
  }
  function toScreen(p) {
    return { x: plot.x + (p.x - world.xmin) / world.width * plot.w, y: plot.y + plot.h - (p.y - world.ymin) / world.height * plot.h };
  }
  function toWorld(p) {
    return { x: world.xmin + (p.x - plot.x) / plot.w * world.width, y: world.ymin + (plot.y + plot.h - p.y) / plot.h * world.height };
  }
  function eventPoint(event) { return new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse()); }
  function path(points, attributes) {
    return node("path", {
      d: points.map((p, i) => { const s = toScreen(p); return `${i ? "L" : "M"}${s.x.toFixed(3)},${s.y.toFixed(3)}`; }).join(" "),
      fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...attributes
    });
  }
  function fit() {
    const xs = state.points.map(p => p.x), ys = state.points.map(p => p.y);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    let width = Math.max(xmax - xmin, 1) * 1.3, height = Math.max(ymax - ymin, 1) * 1.4;
    const ratio = plot.w / plot.h;
    if (width / height < ratio) width = height * ratio; else height = width / ratio;
    world = { xmin: (xmin + xmax - width) / 2, ymin: (ymin + ymax - height) / 2, width, height };
    renderAll();
  }
  function stepSize(span, pixels) {
    const rough = span / Math.max(2, pixels / 90), power = 10 ** Math.floor(Math.log10(rough)), ratio = rough / power;
    return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * power;
  }
  function renderGrid() {
    const layer = $("grid-layer"); layer.replaceChildren();
    const style = { fill: "#666", "font-size": 11, "font-family": "Arial, sans-serif" };
    const xstep = stepSize(world.width, plot.w), ystep = stepSize(world.height, plot.h);
    for (let i = Math.ceil(world.xmin / xstep); i * xstep <= world.xmin + world.width + xstep * 1e-8; i++) {
      const x = toScreen({ x: i * xstep, y: 0 }).x;
      layer.append(node("line", { x1: x, y1: plot.y, x2: x, y2: plot.y + plot.h, stroke: i === 0 ? "#bbb" : "#eee" }));
      layer.append(node("text", { x, y: plot.y + plot.h + 22, "text-anchor": "middle", ...style }, numberText(i * xstep)));
    }
    for (let i = Math.ceil(world.ymin / ystep); i * ystep <= world.ymin + world.height + ystep * 1e-8; i++) {
      const y = toScreen({ x: 0, y: i * ystep }).y;
      layer.append(node("line", { x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: i === 0 ? "#bbb" : "#eee" }));
      layer.append(node("text", { x: plot.x - 10, y: y + 4, "text-anchor": "end", ...style }, numberText(i * ystep)));
    }
    layer.append(node("text", { x: plot.x + plot.w + 10, y: plot.y + plot.h + 22, ...style, "font-style": "italic" }, "x"));
    layer.append(node("text", { x: plot.x - 15, y: plot.y - 9, ...style, "font-style": "italic" }, "y"));
  }
  function renderHandles() {
    const layer = $("handles-layer");
    while (layer.children.length > state.points.length) layer.lastElementChild.remove();
    state.points.forEach((p, i) => {
      let handle = layer.children[i];
      if (!handle) {
        handle = node("g", { class: "control-handle", "data-index": i, role: "button", tabindex: 0 });
        handle.append(node("circle", { r: 18, fill: "transparent" }));
        handle.append(node("circle", { class: "handle-ring", r: 10, fill: "none", stroke: "#777", "stroke-width": 1 }));
        handle.append(node("circle", { r: 5, fill: "#fff", stroke: "#111", "stroke-width": 1.5 }));
        handle.append(node("text", { x: 10, y: -10, fill: "#111", "font-size": 12, "font-family": "Georgia, serif", "paint-order": "stroke", stroke: "#fff", "stroke-width": 3, "pointer-events": "none" }, `P${i}`));
        layer.append(handle);
      }
      const s = toScreen(p);
      handle.setAttribute("transform", `translate(${s.x},${s.y})`);
      handle.setAttribute("aria-label", `控制点 P${i}，x ${editable(p.x)}，y ${editable(p.y)}`);
      handle.setAttribute("aria-pressed", String(state.selected === i));
      handle.children[1].setAttribute("opacity", state.selected === i ? 1 : 0);
    });
  }
  function renderGeometry() {
    const samples = Math.max(240, (state.points.length - 1) * 24);
    const points = Array.from({ length: samples + 1 }, (_, i) => M.evaluate(state.points, i / samples));
    $("curve-layer").replaceChildren(path(points, { stroke: "#000", "stroke-width": 2.3 }));
    $("polygon-layer").replaceChildren(path(state.points, { stroke: "#999", "stroke-width": 1, "stroke-dasharray": "5 5" }));
    renderHandles();
  }
  function renderParameter() {
    const triangle = M.levels(state.points, state.t), current = triangle.at(-1)[0];
    $("parameter").value = state.t;
    if (document.activeElement !== $("parameter-number")) $("parameter-number").value = editable(state.t);
    const layer = $("construction-layer"); layer.replaceChildren();
    triangle.slice(1, -1).forEach((row, index) => {
      const gray = Math.round(165 - 85 * (index + 1) / (state.points.length - 1));
      const color = `rgb(${gray},${gray},${gray})`;
      layer.append(path(row, { stroke: color, "stroke-width": 1 }));
      if (state.points.length <= 12 || row.length <= 5) row.forEach(p => {
        const s = toScreen(p);
        layer.append(node("circle", { cx: s.x, cy: s.y, r: 2.5, fill: "#fff", stroke: color, "stroke-width": 1 }));
      });
    });
    const s = toScreen(current);
    $("current-layer").replaceChildren(
      node("circle", { id: "current-point", cx: s.x, cy: s.y, r: 5.5, fill: "#000", stroke: "#fff", "stroke-width": 1.5, "data-x": current.x, "data-y": current.y }),
      node("text", { x: s.x + 10, y: s.y + 20, fill: "#111", "font-size": 12, "font-family": "Georgia, serif", "font-style": "italic", "paint-order": "stroke", stroke: "#fff", "stroke-width": 3 }, "B(t)")
    );
  }
  function renderList() {
    const list = $("points-list");
    while (list.children.length > state.points.length) list.lastElementChild.remove();
    state.points.forEach((p, i) => {
      let row = list.children[i];
      if (!row) {
        row = document.createElement("div"); row.className = "point-row";
        const label = document.createElement("span"); label.className = "point-label";
        const sub = document.createElement("sub"); sub.textContent = i; label.append("P", sub); row.append(label);
        for (const axis of ["x", "y"]) {
          const input = document.createElement("input"); input.type = "number"; input.step = "any";
          input.min = -M.MAX_COORDINATE; input.max = M.MAX_COORDINATE; input.className = "coordinate";
          input.setAttribute("aria-label", `P${i} ${axis} 坐标`);
          input.addEventListener("focus", () => { state.selected = i; renderHandles(); renderList(); });
          input.addEventListener("change", () => {
            const value = input.valueAsNumber;
            if (!Number.isFinite(value) || Math.abs(value) > M.MAX_COORDINATE) {
              input.value = editable(state.points[i][axis]); error("坐标须为有限数，绝对值不超过 1000000。"); return;
            }
            state.points[i][axis] = value; error(); fit(); save();
          });
          row.append(input);
        }
        list.append(row);
      }
      row.classList.toggle("selected", state.selected === i);
      for (const [j, axis] of [[1, "x"], [2, "y"]]) if (document.activeElement !== row.children[j]) row.children[j].value = editable(p[axis]);
    });
    $("point-count").value = state.points.length;
  }
  function renderAll() { renderGrid(); renderGeometry(); renderParameter(); renderList(); }

  $("point-count").addEventListener("change", event => {
    const count = event.target.valueAsNumber;
    if (!Number.isInteger(count) || count < 2 || count > M.MAX_POINTS) {
      event.target.value = state.points.length; error("控制点数量须为 2–32 的整数。"); return;
    }
    if (count < state.points.length) state.points.length = count;
    while (state.points.length < count) {
      const last = state.points.at(-1);
      state.points.push({ x: Math.min(M.MAX_COORDINATE, last.x + 1), y: last.y });
    }
    state.selected = Math.min(state.selected, count - 1); error(); fit(); save();
  });
  $("parameter").addEventListener("input", event => { state.t = Number(event.target.value); error(); renderParameter(); save(); });
  $("parameter-number").addEventListener("change", event => {
    const t = event.target.valueAsNumber;
    if (!Number.isFinite(t) || t < 0 || t > 1) { event.target.value = editable(state.t); error("参数 t 须在 0 与 1 之间。"); return; }
    state.t = t; error(); renderParameter(); save();
  });
  svg.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag) return;
    const handle = event.target.closest(".control-handle"); if (!handle) return;
    const index = Number(handle.dataset.index), pointer = eventPoint(event), screen = toScreen(state.points[index]);
    state.selected = index;
    drag = { id: event.pointerId, index, before: copyPoints(), dx: screen.x - pointer.x, dy: screen.y - pointer.y };
    svg.focus({ preventScroll: true }); svg.setPointerCapture(event.pointerId);
    renderHandles(); renderList(); event.preventDefault();
  });
  svg.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    const p = eventPoint(event);
    const w = toWorld({ x: Math.max(plot.x, Math.min(plot.x + plot.w, p.x + drag.dx)), y: Math.max(plot.y, Math.min(plot.y + plot.h, p.y + drag.dy)) });
    state.points[drag.index] = { x: rounded(w.x), y: rounded(w.y) };
    renderGeometry(); renderParameter(); renderList();
  });
  function endDrag(event, cancel = false) {
    if (!drag || event.pointerId !== drag.id) return;
    const finished = drag; drag = null;
    if (cancel) state.points = finished.before;
    if (svg.hasPointerCapture(finished.id)) svg.releasePointerCapture(finished.id);
    renderAll(); save();
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", event => endDrag(event, true));
  svg.addEventListener("lostpointercapture", endDrag);
  svg.addEventListener("focusin", event => {
    const handle = event.target.closest(".control-handle");
    if (handle) { state.selected = Number(handle.dataset.index); renderHandles(); renderList(); }
  });
  svg.addEventListener("keydown", event => {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (!directions[event.key] || drag) return;
    event.preventDefault(); const [dx, dy] = directions[event.key], step = event.shiftKey ? 1 : 0.1;
    const point = state.points[state.selected]; point.x = rounded(point.x + dx * step); point.y = rounded(point.y + dy * step);
    renderGeometry(); renderParameter(); renderList(); save();
  });
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) Object.assign(state, M.parseProject(JSON.parse(stored)));
  } catch (_) { /* A missing or outdated save does not prevent opening the page. */ }
  function resize() {
    const width = Math.max(svg.clientWidth, 180), height = Math.max(svg.clientHeight, 180);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    plot = { x: width < 500 ? 42 : 58, y: 28, w: width - (width < 500 ? 68 : 88), h: height - 72 };
    for (const [attribute, value] of Object.entries({ x: plot.x, y: plot.y, width: plot.w, height: plot.h })) $("clip-rect").setAttribute(attribute, value);
    fit();
  }
  resize();
  new ResizeObserver(resize).observe(svg);
})();
