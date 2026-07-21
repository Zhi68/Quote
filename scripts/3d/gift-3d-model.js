(function () {
  // ════════════════════════════════════════════════════════════════
  // Gift Box 展开图 3D 模型 + 折叠 pivot 层级 —— 第二阶段：拆分成 13
  // 个具名面板，配合 gift-3d-player.js 实现 8 阶段折叠动画。
  //
  // 坐标数据、换算逻辑（resolveGiftInput/buildGiftTargetAxes/
  // mapAxisPiecewise/samplePathToPoints）跟第一阶段完全一致，
  // 原样保留，跟 2D 预览用的是同一套真实数据。
  //
  // 面板拆分思路：
  //   Gift Box 的折叠线/切割线之间有真正的十字交叉（不像 Pizza Box
  //   那样能直接用坐标矩形去裁剪一整块轮廓），所以延续第一阶段已经
  //   验证过、你确认"填色没问题"的那套算法——把所有折叠线+切割线画
  //   到离屏 canvas 上当"墨迹"，洪水填充找出画布外部，剩下的连通块
  //   天然会按折痕分隔成一块块独立区域（这就是为什么填色那次能自动
  //   分出合理的小块，不用我手动裁剪）。
  //   这一步在此基础上，把每个连通块按它的外接矩形中心点，对照
  //   一份实测出来的坐标边界表，分类归到 13 个具名面板里，再按你
  //   确认过的嵌套关系（谁带着谁一起转）逐层套 pivot。
  //
  // 折叠线（红色）、切割线（绿色）线条，也按同样的边界表分类，
  // 各自挂到对应面板的 pivot 组里，跟着一起转动。
  //
  // pivot 嵌套层级（跟你确认过的 8 步折叠逻辑一一对应）：
  //   root
  //   ├── PANEL-D（固定参照面，静态网格，不套 pivot，永远不转）
  //   ├── glueTabPivot（锚点：GLUE-TAB｜PANEL-D 折痕）→ GLUE-TAB
  //   ├── panelDBotPivot（锚点：PANEL-D｜PANEL-D-BOT 折痕）→ PANEL-D-BOT
  //   ├── panelDTopPivot（锚点：PANEL-D｜PANEL-D-TOP 折痕）
  //   │     ├── PANEL-D-TOP
  //   │     └── panelDLidPivot（锚点：PANEL-D-TOP｜PANEL-D-LID 折痕，嵌套）
  //   │           └── PANEL-D-LID
  //   └── sideCGroupPivot（锚点：SIDE-C｜PANEL-D 折痕）
  //         ├── SIDE-C
  //         ├── sideCTopPivot / sideCBotPivot
  //         └── panelBGroupPivot（锚点：PANEL-B｜SIDE-C 折痕，嵌套）
  //               ├── PANEL-B（没有单独的顶部翼片）
  //               ├── panelBBotPivot
  //               └── sideAGroupPivot（锚点：SIDE-A｜PANEL-B 折痕，嵌套）
  //                     ├── SIDE-A
  //                     └── sideATopPivot / sideABotPivot
  // ════════════════════════════════════════════════════════════════

  const FOLD_COLOR = 0xd74c4c;
  const CUT_COLOR = 0x4cb36c;
  const PANEL_COLOR = 0xbe9871;
  const Y_FOLD = 0.8;
  const Y_CUT = 1.2;
  const Y_PANEL = 0;

  // ── 跟第一阶段完全一致的辅助函数 ──────────────────────────────
  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
  }

  function valueOrDefault(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  // 跟 app.js 的 resolveGiftInput 完全一致
  function resolveGiftInput(L, W, H) {
    const model = JLC_GIFT_MODEL;

    const l = clamp(valueOrDefault(L, model.defaults.L), model.limits.L.min, model.limits.L.max);
    const w = clamp(valueOrDefault(W, model.defaults.W), model.limits.W.min, Math.min(model.limits.W.max, l));
    const h = clamp(valueOrDefault(H, model.defaults.H), model.limits.H.min, model.limits.H.max);

    return { L: l, W: w, H: h };
  }

  // 跟 app.js 的 interpolateByStops 完全一致
  function interpolateByStops(value, stops) {
    if (!Number.isFinite(value)) {
      return stops[0][1];
    }
    if (value <= stops[0][0]) {
      return stops[0][1];
    }
    for (let i = 0; i < stops.length - 1; i += 1) {
      const [x0, y0] = stops[i];
      const [x1, y1] = stops[i + 1];
      if (value <= x1) {
        const t = (value - x0) / (x1 - x0 || 1);
        return y0 + ((y1 - y0) * t);
      }
    }
    return stops[stops.length - 1][1];
  }

  // 跟 app.js 的 buildGiftTargetAxes 完全一致
  function buildGiftTargetAxes(L, W, H) {
    const x0 = GIFT_REFERENCE_TEMPLATE.baseX[0];
    const x1 = interpolateByStops(W, GIFT_AXIS_STOPS.x1ByW);
    const x2 = x1 + interpolateByStops(L, GIFT_AXIS_STOPS.x2SpanByL);
    const x3 = x2 + interpolateByStops(W, GIFT_AXIS_STOPS.x3SpanByW);
    const x4 = x3 + interpolateByStops(L, GIFT_AXIS_STOPS.x4SpanByL);
    const x5 = x4 + interpolateByStops(W, GIFT_AXIS_STOPS.x5SpanByW);

    const y0 = GIFT_REFERENCE_TEMPLATE.baseY[0];
    const y1 = interpolateByStops(W, GIFT_AXIS_STOPS.y1ByW);
    const y2 = y1 + GIFT_AXIS_STOPS.y2Span;
    const y3 = y2 + interpolateByStops(H, GIFT_AXIS_STOPS.y3SpanByH);
    const y4 = y3 + interpolateByStops(W, GIFT_AXIS_STOPS.y4SpanByW);

    return {
      targetX: [x0, x1, x2, x3, x4, x5],
      targetY: [y0, y1, y2, y3, y4]
    };
  }

  // 跟 app.js 的 mapAxisPiecewise 完全一致
  function mapAxisPiecewise(value, baseAxis, targetAxis) {
    if (!Number.isFinite(value)) return value;
    const n = baseAxis.length;
    if (n < 2) return value;
    if (value <= baseAxis[0]) {
      const t = (value - baseAxis[0]) / (baseAxis[1] - baseAxis[0] || 1);
      return targetAxis[0] + t * (targetAxis[1] - targetAxis[0]);
    }
    if (value >= baseAxis[n - 1]) {
      const t = (value - baseAxis[n - 2]) / (baseAxis[n - 1] - baseAxis[n - 2] || 1);
      return targetAxis[n - 2] + t * (targetAxis[n - 1] - targetAxis[n - 2]);
    }
    for (let i = 0; i < n - 1; i++) {
      const b0 = baseAxis[i];
      const b1 = baseAxis[i + 1];
      if (value >= b0 && value <= b1) {
        const t = (value - b0) / (b1 - b0 || 1);
        return targetAxis[i] + t * (targetAxis[i + 1] - targetAxis[i]);
      }
    }
    return value;
  }

  // cls-1 是折叠线（红色），其它（这份数据里是 cls-2）是切割线（绿色）
  function colorForCls(cls) {
    return cls === "cls-1" ? FOLD_COLOR : CUT_COLOR;
  }
  function yForCls(cls) {
    return cls === "cls-1" ? Y_FOLD : Y_CUT;
  }

  function makeSeg3D(x1, z1, x2, z2, color, y) {
    const pts = [new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color }));
  }

  function makePolyline3D(points, color, y) {
    const pts = points.map((p) => new THREE.Vector3(p.x, y, p.y));
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color }));
  }

  // 解析 SVG path 的 d 字符串（这份数据只用到 M/C/S）
  function samplePathToPoints(d, mapX, mapY, segmentsPerCurve) {
    const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
    const points = [];

    let i = 0;
    let cmd = null;
    let cx = 0, cy = 0;
    let lastC2x = null, lastC2y = null;

    function readNum() { return parseFloat(tokens[i++]); }
    function hasNum() { return i < tokens.length && /^-?\d/.test(tokens[i]); }
    function pushMapped(x, y) { points.push({ x: mapX(x), y: mapY(y) }); }
    function cubicBezier(x0, y0, x1, y1, x2, y2, x3, y3) {
      for (let s = 1; s <= segmentsPerCurve; s++) {
        const t = s / segmentsPerCurve;
        const mt = 1 - t;
        const bx = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
        const by = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
        pushMapped(bx, by);
      }
    }

    while (i < tokens.length) {
      if (/^[A-Za-z]$/.test(tokens[i])) { cmd = tokens[i]; i += 1; continue; }
      const upper = cmd.toUpperCase();
      const rel = cmd !== upper;

      if (upper === "M") {
        const x = readNum() + (rel ? cx : 0);
        const y = readNum() + (rel ? cy : 0);
        cx = x; cy = y;
        pushMapped(cx, cy);
        lastC2x = null; lastC2y = null;
        cmd = rel ? "l" : "L";
        continue;
      }
      if (upper === "L") {
        const x = readNum() + (rel ? cx : 0);
        const y = readNum() + (rel ? cy : 0);
        cx = x; cy = y;
        pushMapped(cx, cy);
        lastC2x = null; lastC2y = null;
        continue;
      }
      if (upper === "C") {
        let x1 = readNum(), y1 = readNum(), x2 = readNum(), y2 = readNum(), x = readNum(), y = readNum();
        if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
        cubicBezier(cx, cy, x1, y1, x2, y2, x, y);
        lastC2x = x2; lastC2y = y2;
        cx = x; cy = y;
        continue;
      }
      if (upper === "S") {
        let x2 = readNum(), y2 = readNum(), x = readNum(), y = readNum();
        if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
        const x1 = lastC2x !== null ? (2 * cx - lastC2x) : cx;
        const y1 = lastC2y !== null ? (2 * cy - lastC2y) : cy;
        cubicBezier(cx, cy, x1, y1, x2, y2, x, y);
        lastC2x = x2; lastC2y = y2;
        cx = x; cy = y;
        continue;
      }
      if (!hasNum()) { continue; }
      readNum();
    }

    return points;
  }

  // 解析真实死线 SVG 原文，抓出所有 <line> / <path>
  let cachedTemplate = null;
  function loadGiftTemplateSync() {
    if (cachedTemplate) return cachedTemplate;

    const svgText = window.GIFT_BOX_TEMPLATE_SVG;
    if (!svgText || !svgText.trim()) {
      throw new Error("Gift Box SVG template text is empty or not loaded.");
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const parseNum = (v) => parseFloat(v || "0");

    const lineElements = Array.from(doc.querySelectorAll("line")).map((el) => ({
      className: el.getAttribute("class") || "",
      x1: parseNum(el.getAttribute("x1")),
      y1: parseNum(el.getAttribute("y1")),
      x2: parseNum(el.getAttribute("x2")),
      y2: parseNum(el.getAttribute("y2"))
    }));

    const pathElements = Array.from(doc.querySelectorAll("path")).map((el) => ({
      className: el.getAttribute("class") || "",
      d: el.getAttribute("d") || ""
    }));

    cachedTemplate = { lineElements, pathElements };
    return cachedTemplate;
  }

  // ── 栅格化 + 洪水填充：把所有折叠线+切割线画到离屏 canvas 上，
  // 从四角洪水填充找出"外部"，剩下的连通块天然按折痕分隔成一块块
  // 独立区域。这是第一阶段已经验证过、你确认"填色没问题"的算法，
  // 这次原样复用，只是最后多了一步"按边界表分类归属到具名面板" ──
  function rasterizeIntoBlobs(lineSegs, curvePolylines, minX, minZ, width, depth) {
    const targetLongSide = 900;
    const scale = targetLongSide / Math.max(width, depth, 1);
    const pad = 3;
    const pxW = Math.ceil(width * scale) + pad * 2;
    const pxH = Math.ceil(depth * scale) + pad * 2;

    const canvas = document.createElement("canvas");
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function toPx(x, z) {
      return [(x - minX) * scale + pad, (z - minZ) * scale + pad];
    }

    lineSegs.forEach(([x1, z1, x2, z2]) => {
      const [px1, py1] = toPx(x1, z1);
      const [px2, py2] = toPx(x2, z2);
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
    });

    curvePolylines.forEach((pts) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      pts.forEach((p, idx) => {
        const [px, py] = toPx(p.x, p.y);
        if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    const imgData = ctx.getImageData(0, 0, pxW, pxH).data;
    function isInk(idx) {
      const r = imgData[idx * 4], g = imgData[idx * 4 + 1], b = imgData[idx * 4 + 2];
      return r < 200 || g < 200 || b < 200;
    }

    const outside = new Uint8Array(pxW * pxH);
    const stack = [];
    [[0, 0], [pxW - 1, 0], [0, pxH - 1], [pxW - 1, pxH - 1]].forEach(([x, y]) => {
      const idx = y * pxW + x;
      if (!isInk(idx) && !outside[idx]) { outside[idx] = 1; stack.push(idx); }
    });
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % pxW, y = (idx / pxW) | 0;
      const cands = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of cands) {
        if (nx >= 0 && nx < pxW && ny >= 0 && ny < pxH) {
          const nidx = ny * pxW + nx;
          if (!outside[nidx] && !isInk(nidx)) { outside[nidx] = 1; stack.push(nidx); }
        }
      }
    }

    const inside = new Uint8Array(pxW * pxH);
    for (let i = 0; i < pxW * pxH; i++) {
      inside[i] = (!isInk(i) && !outside[i]) ? 1 : 0;
    }

    const labels = new Int32Array(pxW * pxH).fill(-1);
    const blobs = [];
    for (let i = 0; i < pxW * pxH; i++) {
      if (inside[i] && labels[i] === -1) {
        const label = blobs.length;
        const pixels = [];
        const st = [i];
        labels[i] = label;
        while (st.length) {
          const idx = st.pop();
          pixels.push(idx);
          const x = idx % pxW, y = (idx / pxW) | 0;
          const cands = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
          for (const [nx, ny] of cands) {
            if (nx >= 0 && nx < pxW && ny >= 0 && ny < pxH) {
              const nidx = ny * pxW + nx;
              if (inside[nidx] && labels[nidx] === -1) {
                labels[nidx] = label;
                st.push(nidx);
              }
            }
          }
        }
        blobs.push(pixels);
      }
    }

    function isInsidePx(x, y) {
      if (x < 0 || x >= pxW || y < 0 || y >= pxH) return false;
      return inside[y * pxW + x] === 1;
    }
    const DIRS = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1]
    ];
    function traceBoundary(startX, startY) {
      const contour = [];
      let cx = startX, cy = startY;
      let backDir = 6;
      const maxSteps = pxW * pxH * 2;
      let steps = 0;
      do {
        contour.push([cx, cy]);
        let found = false;
        for (let k = 0; k < 8; k++) {
          const dir = (backDir + 1 + k) % 8;
          const nx = cx + DIRS[dir][0];
          const ny = cy + DIRS[dir][1];
          if (isInsidePx(nx, ny)) {
            cx = nx; cy = ny;
            backDir = (dir + 4) % 8;
            found = true;
            break;
          }
        }
        if (!found) break;
        steps++;
      } while ((cx !== startX || cy !== startY) && steps < maxSteps);
      return contour;
    }

    const MIN_BLOB_AREA = 30;
    const results = [];

    blobs.forEach((pixels) => {
      if (pixels.length < MIN_BLOB_AREA) return;

      let startIdx = pixels[0];
      let minXpx = Infinity, maxXpx = -Infinity, minYpx = Infinity, maxYpx = -Infinity;
      pixels.forEach((idx) => {
        const y = (idx / pxW) | 0, x = idx % pxW;
        const sy = (startIdx / pxW) | 0, sx = startIdx % pxW;
        if (y < sy || (y === sy && x < sx)) startIdx = idx;
        if (x < minXpx) minXpx = x;
        if (x > maxXpx) maxXpx = x;
        if (y < minYpx) minYpx = y;
        if (y > maxYpx) maxYpx = y;
      });
      const startX = startIdx % pxW, startY = (startIdx / pxW) | 0;

      const contourPx = traceBoundary(startX, startY);
      if (contourPx.length < 3) return;

      const contourWorld = contourPx.map(([px, py]) => [
        (px - pad) / scale + minX,
        (py - pad) / scale + minZ
      ]);

      // 用像素级外接矩形的中心点，代表这个连通块在世界坐标里的
      // 大致位置，用来分类归属到具名面板
      const centerWorldX = ((minXpx + maxXpx) / 2 - pad) / scale + minX;
      const centerWorldZ = ((minYpx + maxYpx) / 2 - pad) / scale + minZ;

      results.push({ contourWorld, centerWorldX, centerWorldZ });
    });

    return results;
  }

  function buildMeshFromContour(contourWorld) {
    const shape = new THREE.Shape();
    contourWorld.forEach(([x, y], idx) => {
      if (idx === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setXYZ(i, posAttr.getX(i), Y_PANEL, posAttr.getY(i));
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ color: PANEL_COLOR, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }

  function buildGift3DModel(dimensions) {
    const root = new THREE.Group();

    const resolved = resolveGiftInput(Number(dimensions.L), Number(dimensions.W), Number(dimensions.H));
    const axes = buildGiftTargetAxes(resolved.L, resolved.W, resolved.H);
    const targetX = axes.targetX;
    const targetY = axes.targetY;

    const mapX = (x) => mapAxisPiecewise(x, GIFT_REFERENCE_TEMPLATE.baseX, targetX);
    const mapY = (y) => mapAxisPiecewise(y, GIFT_REFERENCE_TEMPLATE.baseY, targetY);

    // ── 13 个具名面板的边界表（原始坐标，未换算），核实自实际
    // 折痕坐标，见对话记录 ────────────────────────────────────
    const bx = GIFT_REFERENCE_TEMPLATE.baseX; // [0.14, 240.94, 599.81, 845.29, 1204.16, 1260.85]
    const by = GIFT_REFERENCE_TEMPLATE.baseY; // [0.14, 300.91, 310.27, 758.99, 943.1]

    const X0 = bx[0], X1 = bx[1], X2 = bx[2], X3 = bx[3], X4 = bx[4], X5 = bx[5];
    const Y_OUTER_T = by[0];
    const Y_OUTER_B = by[4];

    const Y_SIDE_TOP = 310.27;     // SIDE-A / SIDE-C 的顶部翼片折痕
    const Y_MAIN_BOT = 758.99;     // 所有列的"主体｜底部翼片"折痕，统一一个值
    const Y_PANEL_D_TOP = 300.91;  // PANEL-D 自己的顶部翼片折痕（跟 SIDE 略有差异）
    const Y_PANEL_D_LID = 68.53;   // PANEL-D-LID｜PANEL-D-TOP 折痕（取台阶形状里
                                    // 占比更大的中段坐标，整条折痕当一条线处理）

    const RAW_BOUNDS = {
      sideATop:   [X0, X1, Y_OUTER_T, Y_SIDE_TOP],
      sideAMain:  [X0, X1, Y_SIDE_TOP, Y_MAIN_BOT],
      sideABot:   [X0, X1, Y_MAIN_BOT, Y_OUTER_B],

      panelBMain: [X1, X2, Y_OUTER_T, Y_MAIN_BOT], // 没有单独的顶部翼片
      panelBBot:  [X1, X2, Y_MAIN_BOT, Y_OUTER_B],

      sideCTop:   [X2, X3, Y_OUTER_T, Y_SIDE_TOP],
      sideCMain:  [X2, X3, Y_SIDE_TOP, Y_MAIN_BOT],
      sideCBot:   [X2, X3, Y_MAIN_BOT, Y_OUTER_B],

      panelDLid:  [X3, X4, Y_OUTER_T, Y_PANEL_D_LID],
      panelDTop:  [X3, X4, Y_PANEL_D_LID, Y_PANEL_D_TOP],
      panelDMain: [X3, X4, Y_PANEL_D_TOP, Y_MAIN_BOT],
      panelDBot:  [X3, X4, Y_MAIN_BOT, Y_OUTER_B],

      glueTab:    [X4, X5, Y_OUTER_T, Y_OUTER_B]
    };

    const BOUNDS = {};
    Object.keys(RAW_BOUNDS).forEach((key) => {
      const [x0, x1, y0, y1] = RAW_BOUNDS[key];
      BOUNDS[key] = [mapX(x0), mapX(x1), mapY(y0), mapY(y1)];
    });

    function findRegionForPoint(x, y) {
      for (const key of Object.keys(BOUNDS)) {
        const [x0, x1, y0, y1] = BOUNDS[key];
        if (x >= x0 - 0.6 && x <= x1 + 0.6 && y >= y0 - 0.6 && y <= y1 + 0.6) {
          return key;
        }
      }
      return null;
    }

    const template = loadGiftTemplateSync();

    const lineSegsForRaster = [];
    const curvePolylinesForRaster = [];
    const allLineSegs = [];
    const allPolylines = [];

    template.lineElements.forEach((line) => {
      const x1 = mapX(line.x1);
      const z1 = mapY(line.y1);
      const x2 = mapX(line.x2);
      const z2 = mapY(line.y2);
      // 切割线(cls-2)的坐标仍然要喂给栅格化算法去算面板形状，
      // 但不再生成可见的绿色线条对象——只有折叠线才建可见线条
      if (line.className !== "cls-2") {
        allLineSegs.push({ x1, z1, x2, z2, color: colorForCls(line.className), y: yForCls(line.className) });
      }
      lineSegsForRaster.push([x1, z1, x2, z2]);
    });

    template.pathElements.forEach((p) => {
      const pts = samplePathToPoints(p.d, mapX, mapY, 16);
      if (pts.length >= 2) {
        if (p.className !== "cls-2") {
          allPolylines.push({ pts, color: colorForCls(p.className), y: yForCls(p.className) });
        }
        curvePolylinesForRaster.push(pts);
      }
    });

    const flatWidth = Math.max(...targetX) - Math.min(...targetX);
    const flatDepth = Math.max(...targetY) - Math.min(...targetY);

    // ── 给每个具名面板建组（THREE.Group），组内先放栅格化描出来的
    // 实心面板网格（按外接矩形中心点分类归属）───────────────────
    const partGroups = {};
    Object.keys(RAW_BOUNDS).forEach((key) => { partGroups[key] = new THREE.Group(); });

    const blobs = rasterizeIntoBlobs(
      lineSegsForRaster, curvePolylinesForRaster,
      Math.min(...targetX), Math.min(...targetY),
      flatWidth, flatDepth
    );
    blobs.forEach((blob) => {
      const region = findRegionForPoint(blob.centerWorldX, blob.centerWorldZ);
      if (region && partGroups[region]) {
        partGroups[region].add(buildMeshFromContour(blob.contourWorld));
      }
      // 分类失败的极小碎块（栅格化误差）直接丢弃，不影响整体效果
    });

    // ── 把所有折叠线/切割线，按中点/重心坐标分类挂到对应面板组里 ──
    allLineSegs.forEach((seg) => {
      const mx = (seg.x1 + seg.x2) / 2;
      const mz = (seg.z1 + seg.z2) / 2;
      const region = findRegionForPoint(mx, mz);
      const line3d = makeSeg3D(seg.x1, seg.z1, seg.x2, seg.z2, seg.color, seg.y);
      if (region && partGroups[region]) {
        partGroups[region].add(line3d);
      } else {
        root.add(line3d);
      }
    });

    allPolylines.forEach((pl) => {
      const cx = pl.pts.reduce((s, p) => s + p.x, 0) / pl.pts.length;
      const cy = pl.pts.reduce((s, p) => s + p.y, 0) / pl.pts.length;
      const region = findRegionForPoint(cx, cy);
      const poly3d = makePolyline3D(pl.pts, pl.color, pl.y);
      if (region && partGroups[region]) {
        partGroups[region].add(poly3d);
      } else {
        root.add(poly3d);
      }
    });

    // ── 搭 pivot 层级 ────────────────────────────────────────────
    // 规则（跟 pizza-3d-model.js 踩过坑后确认的写法一致）：
    // THREE.Group 的 .position 是"相对自己直接父级"的偏移量，
    // 用来决定折叠转轴摆在哪；但 group 内部网格顶点存的是绝对世界
    // 坐标，抵消用的必须是"这个 pivot 自己的绝对世界锚点"，
    // 这两个值在有嵌套的情况下不一样，分开传。
    function attachAtAnchor(pivot, group, relX, relZ, absX, absZ) {
      pivot.position.set(relX, 0, relZ);
      group.position.set(-absX, 0, -absZ);
      pivot.add(group);
    }

    const anchorX1 = mapX(X1); // SIDE-A｜PANEL-B
    const anchorX2 = mapX(X2); // PANEL-B｜SIDE-C
    const anchorX3 = mapX(X3); // SIDE-C｜PANEL-D
    const anchorX4 = mapX(X4); // PANEL-D｜GLUE-TAB

    const anchorYSideTop = mapY(Y_SIDE_TOP);
    const anchorYMainBot = mapY(Y_MAIN_BOT);
    const anchorYPanelDTop = mapY(Y_PANEL_D_TOP);
    const anchorYPanelDLid = mapY(Y_PANEL_D_LID);

    // PANEL-D（固定参照面，直接挂 root，不套 pivot，永远不转）
    root.add(partGroups.panelDMain);

    // GLUE-TAB（父级 root，绝对锚点＝相对偏移）
    const glueTabPivot = new THREE.Group();
    attachAtAnchor(glueTabPivot, partGroups.glueTab, anchorX4, 0, anchorX4, 0);
    root.add(glueTabPivot);

    // PANEL-D-BOT（父级 root）
    const panelDBotPivot = new THREE.Group();
    attachAtAnchor(panelDBotPivot, partGroups.panelDBot, 0, anchorYMainBot, 0, anchorYMainBot);
    root.add(panelDBotPivot);

    // PANEL-D-TOP（父级 root）+ 嵌套 PANEL-D-LID
    const panelDTopPivot = new THREE.Group();
    attachAtAnchor(panelDTopPivot, partGroups.panelDTop, 0, anchorYPanelDTop, 0, anchorYPanelDTop);

    const panelDLidPivot = new THREE.Group();
    attachAtAnchor(panelDLidPivot, partGroups.panelDLid,
      0, anchorYPanelDLid - anchorYPanelDTop, 0, anchorYPanelDLid);
    panelDTopPivot.add(panelDLidPivot);
    root.add(panelDTopPivot);

    // SIDE-C 整体（父级 root）+ 嵌套 SIDE-C 耳朵 + 嵌套 PANEL-B 整体
    const sideCGroupPivot = new THREE.Group();
    attachAtAnchor(sideCGroupPivot, partGroups.sideCMain, anchorX3, 0, anchorX3, 0);

    const sideCTopPivot = new THREE.Group();
    attachAtAnchor(sideCTopPivot, partGroups.sideCTop, 0, anchorYSideTop, anchorX3, anchorYSideTop);
    const sideCBotPivot = new THREE.Group();
    attachAtAnchor(sideCBotPivot, partGroups.sideCBot, 0, anchorYMainBot, anchorX3, anchorYMainBot);
    sideCGroupPivot.add(sideCTopPivot);
    sideCGroupPivot.add(sideCBotPivot);

    // PANEL-B 整体（嵌套在 sideCGroupPivot 里）+ 嵌套 PANEL-B-BOT + 嵌套 SIDE-A 整体
    const panelBGroupPivot = new THREE.Group();
    attachAtAnchor(panelBGroupPivot, partGroups.panelBMain,
      anchorX2 - anchorX3, 0, anchorX2, 0);

    const panelBBotPivot = new THREE.Group();
    attachAtAnchor(panelBBotPivot, partGroups.panelBBot, 0, anchorYMainBot, anchorX2, anchorYMainBot);
    panelBGroupPivot.add(panelBBotPivot);

    // SIDE-A 整体（嵌套在 panelBGroupPivot 里）+ 嵌套 SIDE-A 耳朵
    const sideAGroupPivot = new THREE.Group();
    attachAtAnchor(sideAGroupPivot, partGroups.sideAMain,
      anchorX1 - anchorX2, 0, anchorX1, 0);

    const sideATopPivot = new THREE.Group();
    attachAtAnchor(sideATopPivot, partGroups.sideATop, 0, anchorYSideTop, anchorX1, anchorYSideTop);
    const sideABotPivot = new THREE.Group();
    attachAtAnchor(sideABotPivot, partGroups.sideABot, 0, anchorYMainBot, anchorX1, anchorYMainBot);
    sideAGroupPivot.add(sideATopPivot);
    sideAGroupPivot.add(sideABotPivot);

    panelBGroupPivot.add(sideAGroupPivot);
    sideCGroupPivot.add(panelBGroupPivot);
    root.add(sideCGroupPivot);

    // 整体展开图的外轮廓宽/深，给 3D 场景自动调镜头用，
    // 并把整体平移到几何中心对齐原点
    const centerX = (Math.max(...targetX) + Math.min(...targetX)) / 2;
    const centerZ = (Math.max(...targetY) + Math.min(...targetY)) / 2;

    // PANEL-D 是这个箱型的固定参照面，镜头应该对准它的中心，而不是
    // 整条展开图（SIDE-A~GLUE-TAB 五块拼一起）的几何中心——那个中心点
    // 其实落在 PANEL-B｜SIDE-C 交界附近，不是 PANEL-D。这里算出
    // PANEL-D 中心在世界坐标里的实际位置（要减掉上面的 centerX，
    // 因为 root 整体会被这个 centerX 平移一次）
    const focusX = (anchorX3 + anchorX4) / 2 - centerX;

    root.position.x = -centerX;
    root.position.z = -centerZ;

    return {
      root,
      dimensions: resolved,
      flatWidth,
      flatDepth,
      focusX,
      parts: {
        glueTabPivot,
        panelDBotPivot,
        panelDTopPivot, panelDLidPivot,
        sideCGroupPivot, sideCTopPivot, sideCBotPivot,
        panelBGroupPivot, panelBBotPivot,
        sideAGroupPivot, sideATopPivot, sideABotPivot
      }
    };
  }

  window.Gift3DModel = { buildGift3DModel };
})();