(function () {
    // ════════════════════════════════════════════════════════════════
    // Pizza Box（Template B）展开图 3D 模型 —— 第二阶段：拆分成 17 个
    // 具名面板 + BASE 固定件，套好嵌套 pivot 层级，配合
    // pizza-3d-player.js 实现 8 阶段折叠动画。
    //
    // 坐标数据、换算公式（predictAnchors/mapAxisPiecewise/
    // samplePathToPoints/resolvePizzaInput）都是从第一阶段原样保留的，
    // 跟 2D 预览用的是同一套真实数据，没有另外简化。
    //
    // 面板拆分思路：
    //   第一阶段是把所有切割线自动拼成"1个外轮廓 + 4个洞"，建一整块
    //   实心面板。这一阶段在此基础上，按照跟你核对过的真实折痕坐标，
    //   把这一整块面板用矩形边界"裁剪"成 19 小块（17 个需要独立
    //   pivot 的面板 + BASE 本体 + BASE 自带的锁扣洞已经在第一阶段
    //   处理过，这次拆分后仍然保留在 BASE 那一块里）。
    //   裁剪用的是标准的 Sutherland-Hodgman 多边形裁剪算法，会保留
    //   真实的圆角/斜线细节（只在裁剪边界处新增直线切边），不是
    //   简化成方块。
    //
    // 折叠线（红色）、切割线（绿色）线条，也按同样的矩形边界分类，
    // 各自挂到对应面板的 pivot 组里，跟着一起转动。
    //
    // pivot 嵌套层级（跟你确认过的 8 步折叠逻辑一一对应）：
    //   root
    //   ├── BASE（固定参照面，静态网格，不套 pivot）
    //   ├── baseSideGroupPivot（锚点：BASE｜BASE-SIDE 折痕）
    //   │     ├── BASE-SIDE
    //   │     ├── baseSideEarTopPivot → BASE-SIDE-EAR-TOP
    //   │     └── baseSideEarBotPivot → BASE-SIDE-EAR-BOT
    //   ├── hingeGroupPivot（锚点：BASE｜HINGE 折痕）
    //   │     ├── HINGE
    //   │     ├── hingeEarTopPivot / hingeEarBotPivot
    //   │     └── lidGroupPivot（锚点：HINGE｜LID 折痕，嵌套）
    //   │           ├── LID
    //   │           ├── lidFrontPivot / lidBackPivot
    //   │           └── lidSidePivot（锚点：LID｜LID-SIDE 折痕，嵌套）
    //   │                 ├── LID-SIDE
    //   │                 └── lidSideEarTopPivot / lidSideEarBotPivot
    //   ├── topFoldInnerPivot（锚点：BASE 顶边｜FOLD-TOP-INNER 折痕）
    //   │     └── FOLD-TOP-INNER
    //   │           └── topMidPanelPivot（锚点：FOLD-TOP-INNER｜MID-TOP-PANEL）
    //   │                 └── MID-TOP-PANEL
    //   │                       └── topFoldOuterPivot（锚点：MID-TOP-PANEL｜FOLD-TOP-OUTER）
    //   │                             └── FOLD-TOP-OUTER（含 LOCK-TOP-A/B，刚性一起转）
    //   └── botFoldInnerPivot（镜像，结构同上）
    //         └── FOLD-BOT-INNER → botMidPanelPivot → MID-BOT-PANEL
    //               → botFoldOuterPivot → FOLD-BOT-OUTER（含 LOCK-BOT-A/B）
    // ════════════════════════════════════════════════════════════════
  
    const PANEL_COLOR = 0xbe9871;
    const FOLD_COLOR = 0xd74c4c;
    const CUT_COLOR = 0x4cb36c;
    const Y_PANEL = 0;
    const Y_FOLD = 0.8;
    const Y_CUT = 1.2;
  
    // ── 跟第一阶段完全一致的辅助函数 ──────────────────────────────
    // 数值兜底：非法值（NaN/undefined）落到 min，超出范围的夹到边界内
    function clamp(value, min, max) {
      if (!Number.isFinite(value)) return min;
      return Math.min(Math.max(value, min), max);
    }
  
    // 数值不合法时用兜底默认值
    function valueOrDefault(value, fallback) {
      return Number.isFinite(value) ? value : fallback;
    }
  
    // 跟 app.js 的 resolvePizzaInput 完全一致：W 不能超过 L，
    // D 不能超过 W+X（X 是版型自带的固定余量）
    function resolvePizzaInput(L, W, H) {
      const model = JLC_PIZZA_MODEL;
      const x = model.defaults.X;
  
      const l = clamp(valueOrDefault(L, model.defaults.L), model.limits.L.min, model.limits.L.max);
      const w = clamp(valueOrDefault(W, model.defaults.W), model.limits.W.min, l);
      const d = clamp(valueOrDefault(H, model.defaults.D), model.limits.D.min, w + x);
  
      return { L: l, W: w, D: d, X: x };
    }
  
    // 跟 app.js 的 enforceMonotonic 完全一致：确保坐标序列单调递增，
    // 避免极端 L/W/D 组合导致坐标点次序错乱
    function enforceMonotonic(values) {
      const out = values.slice();
      for (let i = 1; i < out.length; i++) {
        if (out[i] <= out[i - 1]) {
          out[i] = out[i - 1] + 0.0001;
        }
      }
      return out;
    }
  
    // 跟 app.js 的 predictTemplateBAnchors 完全一致：拿回归系数
    // （coeffX/coeffY）算出给定 L/W/D 时，每个关键坐标点应该落在哪里
    function predictAnchors(model, L, W, D) {
      const targetX = model.coeffX.map((c) => c[0] * L + c[1] * W + c[2] * D + c[3]);
      const targetY = model.coeffY.map((c) => c[0] * L + c[1] * W + c[2] * D + c[3]);
      return {
        x: enforceMonotonic(targetX),
        y: enforceMonotonic(targetY)
      };
    }
  
    // 跟 app.js 的 mapAxisPiecewise 完全一致：把原始死线图上的任意一个
    // 坐标值，按分段线性插值映射到当前 L/W/D 对应的实际坐标
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
  
    // cls-3 是切割线（绿色），其它（这份数据里是 cls-2）是折叠线（红色）
    function colorForCls(cls) {
      return cls === "cls-3" ? CUT_COLOR : FOLD_COLOR;
    }
  
    function yForCls(cls) {
      return cls === "cls-3" ? Y_CUT : Y_FOLD;
    }
  
    // 生成一条两点直线段（跟 rsc-3d-model.js 的 makeSeg 风格一致）
    function makeSeg3D(x1, z1, x2, z2, color, y) {
      const pts = [new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)];
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color }));
    }
  
    // 把一串 3D 点连成一条折线（用于贝塞尔曲线采样出来的点序列）
    function makePolyline3D(points, color, y) {
      const pts = points.map((p) => new THREE.Vector3(p.x, y, p.y));
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color }));
    }
  
    // 解析 SVG path 的 d 字符串，只需要支持这份数据里实际出现的命令
    // （M / C / S），把贝塞尔曲线采样成一串点，采样点本身已经用
    // mapX/mapY 换算过坐标
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
  
    // ── 自动拼接切割线轮廓（第一阶段的算法，原样保留）─────────────
    // 把坐标四舍五入当"图的顶点"，用来把浮点误差导致的"差一点点没对上"
    // 的端点合并成同一个点
    function roundKey(pt, prec) {
      return pt[0].toFixed(prec) + "," + pt[1].toFixed(prec);
    }
  
    // 把一堆首尾相连的线段，自动拆解成若干个"闭合环"：
    // 面积最大的当整体外轮廓，其余小的当洞（比如四个锁扣洞）
    function traceCutLoops(edges, precision) {
      const adj = new Map();
      const pointOf = new Map();
  
      function addPoint(pt) {
        const k = roundKey(pt, precision);
        if (!pointOf.has(k)) pointOf.set(k, pt);
        return k;
      }
  
      edges.forEach(([a, b]) => {
        const ka = addPoint(a);
        const kb = addPoint(b);
        if (ka === kb) return;
        if (!adj.has(ka)) adj.set(ka, new Set());
        if (!adj.has(kb)) adj.set(kb, new Set());
        adj.get(ka).add(kb);
        adj.get(kb).add(ka);
      });
  
      function edgeId(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
  
      const remaining = new Set();
      adj.forEach((nbrs, k) => { nbrs.forEach((n) => remaining.add(edgeId(k, n))); });
  
      const loops = [];
      while (remaining.size > 0) {
        const firstId = remaining.values().next().value;
        const [start, second] = firstId.split("|");
        remaining.delete(firstId);
  
        const loopKeys = [start];
        let curKey = second;
  
        while (curKey !== start) {
          loopKeys.push(curKey);
          let nextKey = null;
          const nbrs = adj.get(curKey);
          for (const n of nbrs) {
            const eid = edgeId(curKey, n);
            if (remaining.has(eid)) { nextKey = n; remaining.delete(eid); break; }
          }
          if (nextKey === null) break;
          curKey = nextKey;
        }
  
        loops.push(loopKeys.map((k) => pointOf.get(k)));
      }
  
      return loops;
    }
  
    // 算一个环的外接矩形面积，用来判断"这是外轮廓还是洞"（面积最大的是外轮廓）
    function loopBoundsArea(loop) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      loop.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      });
      return (maxX - minX) * (maxY - minY);
    }
  
    // ── Sutherland-Hodgman 多边形裁剪：按一个矩形边界裁一刀，
    // 保留矩形内部的部分，裁剪边界处新增直线切边，矩形内部原有的
    // 真实曲线/斜线细节完整保留，不做任何简化 ──────────────────
    function clipPolygonToRect(poly, xMin, xMax, yMin, yMax) {
      function clipEdge(points, inside, intersect) {
        const out = [];
        for (let i = 0; i < points.length; i++) {
          const cur = points[i];
          const prev = points[(i - 1 + points.length) % points.length];
          const curIn = inside(cur);
          const prevIn = inside(prev);
          if (curIn) {
            if (!prevIn) out.push(intersect(prev, cur));
            out.push(cur);
          } else if (prevIn) {
            out.push(intersect(prev, cur));
          }
        }
        return out;
      }
  
      let pts = poly;
      pts = clipEdge(pts, (p) => p[0] >= xMin, (a, b) => {
        const t = (xMin - a[0]) / (b[0] - a[0]);
        return [xMin, a[1] + t * (b[1] - a[1])];
      });
      pts = clipEdge(pts, (p) => p[0] <= xMax, (a, b) => {
        const t = (xMax - a[0]) / (b[0] - a[0]);
        return [xMax, a[1] + t * (b[1] - a[1])];
      });
      pts = clipEdge(pts, (p) => p[1] >= yMin, (a, b) => {
        const t = (yMin - a[1]) / (b[1] - a[1]);
        return [a[0] + t * (b[0] - a[0]), yMin];
      });
      pts = clipEdge(pts, (p) => p[1] <= yMax, (a, b) => {
        const t = (yMax - a[1]) / (b[1] - a[1]);
        return [a[0] + t * (b[0] - a[0]), yMax];
      });
      return pts;
    }
  
    // 用裁剪后的点集建实心网格（简单多边形，不含洞），
    // 用于除 BASE 之外的所有面板
    function buildFlatMeshFromPolygon(poly, color) {
      if (!poly || poly.length < 3) return null;
      const shape = new THREE.Shape();
      poly.forEach(([x, y], idx) => {
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
  
      const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
      return new THREE.Mesh(geo, mat);
    }
  
    // 用裁剪后的外轮廓 + 若干裁剪后的洞，建实心网格
    // （BASE 专用，因为 BASE 自己带 4 个锁扣洞）
    function buildFlatMeshWithHoles(outerPoly, holePolys, color) {
      if (!outerPoly || outerPoly.length < 3) return null;
      const shape = new THREE.Shape();
      outerPoly.forEach(([x, y], idx) => {
        if (idx === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      });
      shape.closePath();
  
      holePolys.forEach((hole) => {
        if (hole.length < 3) return;
        const path = new THREE.Path();
        hole.forEach(([x, y], idx) => {
          if (idx === 0) path.moveTo(x, y); else path.lineTo(x, y);
        });
        path.closePath();
        shape.holes.push(path);
      });
  
      const geo = new THREE.ShapeGeometry(shape);
      const posAttr = geo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(i, posAttr.getX(i), Y_PANEL, posAttr.getY(i));
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
  
      const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
      return new THREE.Mesh(geo, mat);
    }
  
    function buildPizza3DModel(dimensions) {
      const model = window.PIZZA_TEMPLATE_B_MODEL;
      const root = new THREE.Group();
  
      if (!model) {
        return { root, dimensions: { L: 0, W: 0, H: 0 }, flatWidth: 300, flatDepth: 200, parts: {} };
      }
  
      const resolved = resolvePizzaInput(Number(dimensions.L), Number(dimensions.W), Number(dimensions.H));
      const predicted = predictAnchors(model, resolved.L, resolved.W, resolved.D);
      const targetX = predicted.x;
      const targetY = predicted.y;
  
      const mapX = (x) => mapAxisPiecewise(x, model.baseX, targetX);
      const mapY = (y) => mapAxisPiecewise(y, model.baseY, targetY);
  
      // ── 17 个面板 + BASE 的边界表（原始坐标，未换算），核对自
      // 实际折痕坐标，见对话记录 ─────────────────────────────────
      const bx = model.baseX;
      const by = model.baseY;
  
      const X_OUTER_L = bx[0];       // 14.34  展开图最左边界
      const X_LS_LID = bx[6];        // 192.36 LID-SIDE｜LID 折痕
      const X_LID_HINGE = bx[13];    // 1300.99 LID｜HINGE 折痕
      const X_HINGE_BASE = bx[17];   // 1480.42 HINGE｜BASE 折痕
      const X_BASE_BSIDE = bx[28];   // 2578.28 BASE｜BASE-SIDE 折痕
      const X_OUTER_R = bx[31];      // 2753.04 展开图最右边界
  
      const Y_OUTER_T = by[0];       // 14.29  展开图最上边界
      const Y_OUTER_B = by[47];      // 2013   展开图最下边界
  
      const Y_LS_EAR_T = 416.24;
      const Y_LS_EAR_B = 1611.04;
      const Y_HINGE_EAR_T = 416.24;
      const Y_HINGE_EAR_B = 1611.04;
      const Y_LID_FRONT = 437.29;
      const Y_LID_BACK = 1590.00;
      const Y_BSIDE_EAR_T = 425.59;
      const Y_BSIDE_EAR_B = 1601.69;
  
      const Y_BASE_FOLDOUTER_MID_T = 199.39;
      const Y_BASE_MID_FOLDINNER_T = 227.45;
      const Y_BASE_FOLDINNER_MAIN_T = 406.89;
      const Y_BASE_MAIN_FOLDINNER_B = 1620.40;
      const Y_BASE_FOLDINNER_MID_B = 1799.83;
      const Y_BASE_MID_FOLDOUTER_B = 1827.89;
  
      const RAW_BOUNDS = {
        lidSideEarTop: [X_OUTER_L, X_LS_LID, Y_OUTER_T, Y_LS_EAR_T],
        lidSideMain:   [X_OUTER_L, X_LS_LID, Y_LS_EAR_T, Y_LS_EAR_B],
        lidSideEarBot: [X_OUTER_L, X_LS_LID, Y_LS_EAR_B, Y_OUTER_B],
  
        lidFront: [X_LS_LID, X_LID_HINGE, Y_OUTER_T, Y_LID_FRONT],
        lidMain:  [X_LS_LID, X_LID_HINGE, Y_LID_FRONT, Y_LID_BACK],
        lidBack:  [X_LS_LID, X_LID_HINGE, Y_LID_BACK, Y_OUTER_B],
  
        hingeEarTop: [X_LID_HINGE, X_HINGE_BASE, Y_OUTER_T, Y_HINGE_EAR_T],
        hingeMain:   [X_LID_HINGE, X_HINGE_BASE, Y_HINGE_EAR_T, Y_HINGE_EAR_B],
        hingeEarBot: [X_LID_HINGE, X_HINGE_BASE, Y_HINGE_EAR_B, Y_OUTER_B],
  
        baseFoldOuterTop: [X_HINGE_BASE, X_BASE_BSIDE, Y_OUTER_T, Y_BASE_FOLDOUTER_MID_T],
        baseMidTop:       [X_HINGE_BASE, X_BASE_BSIDE, Y_BASE_FOLDOUTER_MID_T, Y_BASE_MID_FOLDINNER_T],
        baseFoldInnerTop: [X_HINGE_BASE, X_BASE_BSIDE, Y_BASE_MID_FOLDINNER_T, Y_BASE_FOLDINNER_MAIN_T],
        baseMain:         [X_HINGE_BASE, X_BASE_BSIDE, Y_BASE_FOLDINNER_MAIN_T, Y_BASE_MAIN_FOLDINNER_B],
        baseFoldInnerBot: [X_HINGE_BASE, X_BASE_BSIDE, Y_BASE_MAIN_FOLDINNER_B, Y_BASE_FOLDINNER_MID_B],
        baseMidBot:       [X_HINGE_BASE, X_BASE_BSIDE, Y_BASE_FOLDINNER_MID_B, Y_BASE_MID_FOLDOUTER_B],
        baseFoldOuterBot: [X_HINGE_BASE, X_BASE_BSIDE, Y_BASE_MID_FOLDOUTER_B, Y_OUTER_B],
  
        baseSideEarTop: [X_BASE_BSIDE, X_OUTER_R, Y_OUTER_T, Y_BSIDE_EAR_T],
        baseSideMain:   [X_BASE_BSIDE, X_OUTER_R, Y_BSIDE_EAR_T, Y_BSIDE_EAR_B],
        baseSideEarBot: [X_BASE_BSIDE, X_OUTER_R, Y_BSIDE_EAR_B, Y_OUTER_B]
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
  
      const cutEdges = [];
      const allLineSegs = [];
      const allPolylines = [];
  
      model.lineElements.forEach((line) => {
        const x1 = mapX(line.x1), z1 = mapY(line.y1);
        const x2 = mapX(line.x2), z2 = mapY(line.y2);
        // 切割线(cls-3)的坐标仍然要喂给 cutEdges 去拼面板轮廓，
        // 但不再生成可见的绿色线条对象——只有折叠线才建可见线条
        if (line.cls !== "cls-3") {
          allLineSegs.push({ x1, z1, x2, z2, color: colorForCls(line.cls), y: yForCls(line.cls) });
        }
        if (line.cls === "cls-3") cutEdges.push([[x1, z1], [x2, z2]]);
      });
  
      model.pathElements.forEach((p) => {
        const pts = samplePathToPoints(p.d, mapX, mapY, 16);
        if (pts.length >= 2) {
          if (p.cls !== "cls-3") {
            allPolylines.push({ pts, color: colorForCls(p.cls), y: yForCls(p.cls) });
          }
          if (p.cls === "cls-3") {
            for (let i = 0; i < pts.length - 1; i++) {
              cutEdges.push([[pts[i].x, pts[i].y], [pts[i + 1].x, pts[i + 1].y]]);
            }
          }
        }
      });
  
      const loops = traceCutLoops(cutEdges, 1);
      loops.sort((a, b) => loopBoundsArea(b) - loopBoundsArea(a));
      const outerLoop = loops[0] || [];
      const holeLoops = loops.slice(1);
  
      const partGroups = {};
      Object.keys(BOUNDS).forEach((key) => {
        const [x0, x1, y0, y1] = BOUNDS[key];
        const clipped = clipPolygonToRect(outerLoop, x0, x1, y0, y1);
        let mesh;
        if (key === "baseMain") {
          const clippedHoles = holeLoops
            .map((h) => clipPolygonToRect(h, x0, x1, y0, y1))
            .filter((h) => h.length >= 3);
          mesh = buildFlatMeshWithHoles(clipped, clippedHoles, PANEL_COLOR);
        } else {
          mesh = buildFlatMeshFromPolygon(clipped, PANEL_COLOR);
        }
        const group = new THREE.Group();
        if (mesh) group.add(mesh);
        partGroups[key] = group;
      });
  
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
      // 关键规则（上一版在这里出过 bug，这次特别注明）：
      // THREE.Group 的 .position 永远是"相对自己的直接父级"的偏移量，
      // 不是绝对世界坐标。如果某个 pivot 嵌套在另一个 pivot 里面
      // （比如 lidGroupPivot 嵌在 hingeGroupPivot 里面），
      // 就必须用"自己的真实锚点 - 父级的真实锚点"这个差值，
      // 不能直接填自己的真实锚点绝对值——不然父级已经带来的偏移
      // 会跟子级自己的偏移重复叠加，嵌套越深、错得越离谱。
      // 只有直接挂在 root 下面的顶层 pivot，才能直接用绝对锚点。
      function attachAtAnchor(pivot, group, relX, relZ, absX, absZ) {
        // relX/relZ = 这个 pivot 相对它自己父级的偏移量（决定折叠转轴摆在哪）。
        // absX/absZ = 这个 pivot 自己的真实世界绝对锚点坐标。
        // 这两个值在有嵌套的情况下是不一样的，之前那版 bug 就是把这两个
        // 混成了同一个值：
        //   pivot.position 必须用"相对父级"的偏移量，转轴位置才不会跟父级已有
        //   的偏移重复叠加；
        //   但 group 内部网格顶点存的是"绝对世界坐标"，要把它挪回 pivot 自己
        //   的局部原点，抵消的必须是"绝对世界锚点"，不能拿相对偏移量去抵消——
        //   不然父级链条上已经带的偏移没抵消干净，子级网格还是会跑偏。
        pivot.position.set(relX, 0, relZ);
        group.position.set(-absX, 0, -absZ);
        pivot.add(group);
      }
  
      const anchorLsLid = mapX(X_LS_LID);
      const anchorLidHinge = mapX(X_LID_HINGE);
      const anchorHingeBase = mapX(X_HINGE_BASE);
      const anchorBaseBside = mapX(X_BASE_BSIDE);
  
      // BASE（固定参照面，直接挂 root，不套 pivot，永远不转）
      root.add(partGroups.baseMain);
  
      // ── BASE-SIDE 整体：父级是 root，相对偏移＝绝对锚点 ──────────
      const baseSideGroupPivot = new THREE.Group();
      attachAtAnchor(baseSideGroupPivot, partGroups.baseSideMain,
        anchorBaseBside, 0, anchorBaseBside, 0);
      // 耳朵是 baseSideGroupPivot 的子节点：相对偏移＝0（X 方向不用再偏移，
      // Z 方向父级偏移是 0，直接用耳朵自己的相对值即可）；
      // 绝对锚点＝耳朵自己真实的世界坐标（X 沿用 anchorBaseBside，因为耳朵
      // 没有额外 X 偏移，Z 是耳朵自己的真实 Y 位置）
      const baseSideEarTopPivot = new THREE.Group();
      attachAtAnchor(baseSideEarTopPivot, partGroups.baseSideEarTop,
        0, mapY(Y_BSIDE_EAR_T), anchorBaseBside, mapY(Y_BSIDE_EAR_T));
      const baseSideEarBotPivot = new THREE.Group();
      attachAtAnchor(baseSideEarBotPivot, partGroups.baseSideEarBot,
        0, mapY(Y_BSIDE_EAR_B), anchorBaseBside, mapY(Y_BSIDE_EAR_B));
      baseSideGroupPivot.add(baseSideEarTopPivot);
      baseSideGroupPivot.add(baseSideEarBotPivot);
      root.add(baseSideGroupPivot);
  
      // ── HINGE 整体：父级是 root，相对偏移＝绝对锚点 ──────────────
      const hingeGroupPivot = new THREE.Group();
      attachAtAnchor(hingeGroupPivot, partGroups.hingeMain,
        anchorHingeBase, 0, anchorHingeBase, 0);
      const hingeEarTopPivot = new THREE.Group();
      attachAtAnchor(hingeEarTopPivot, partGroups.hingeEarTop,
        0, mapY(Y_HINGE_EAR_T), anchorHingeBase, mapY(Y_HINGE_EAR_T));
      const hingeEarBotPivot = new THREE.Group();
      attachAtAnchor(hingeEarBotPivot, partGroups.hingeEarBot,
        0, mapY(Y_HINGE_EAR_B), anchorHingeBase, mapY(Y_HINGE_EAR_B));
      hingeGroupPivot.add(hingeEarTopPivot);
      hingeGroupPivot.add(hingeEarBotPivot);
  
      // ── LID 整体：嵌套在 hingeGroupPivot 里面。相对偏移＝两个绝对锚点
      // 之差；绝对锚点＝LID 自己真实的世界坐标（anchorLidHinge, 0）──────
      const lidGroupPivot = new THREE.Group();
      attachAtAnchor(lidGroupPivot, partGroups.lidMain,
        anchorLidHinge - anchorHingeBase, 0, anchorLidHinge, 0);
      const lidFrontPivot = new THREE.Group();
      attachAtAnchor(lidFrontPivot, partGroups.lidFront,
        0, mapY(Y_LID_FRONT), anchorLidHinge, mapY(Y_LID_FRONT));
      const lidBackPivot = new THREE.Group();
      attachAtAnchor(lidBackPivot, partGroups.lidBack,
        0, mapY(Y_LID_BACK), anchorLidHinge, mapY(Y_LID_BACK));
      lidGroupPivot.add(lidFrontPivot);
      lidGroupPivot.add(lidBackPivot);
  
      // ── LID-SIDE 整体：嵌套在 lidGroupPivot 里面，逻辑同上 ────────
      const lidSidePivot = new THREE.Group();
      attachAtAnchor(lidSidePivot, partGroups.lidSideMain,
        anchorLsLid - anchorLidHinge, 0, anchorLsLid, 0);
      const lidSideEarTopPivot = new THREE.Group();
      attachAtAnchor(lidSideEarTopPivot, partGroups.lidSideEarTop,
        0, mapY(Y_LS_EAR_T), anchorLsLid, mapY(Y_LS_EAR_T));
      const lidSideEarBotPivot = new THREE.Group();
      attachAtAnchor(lidSideEarBotPivot, partGroups.lidSideEarBot,
        0, mapY(Y_LS_EAR_B), anchorLsLid, mapY(Y_LS_EAR_B));
      lidSidePivot.add(lidSideEarTopPivot);
      lidSidePivot.add(lidSideEarBotPivot);
  
      lidGroupPivot.add(lidSidePivot);
      hingeGroupPivot.add(lidGroupPivot);
      root.add(hingeGroupPivot);
  
      // ── BASE 顶部折叠堆叠：X 方向全程不偏移（都是 0），
      // Z 方向每一层的绝对锚点都是真实坐标，相对偏移＝跟上一层绝对锚点的差值 ──
      const topFoldInnerAbsZ = mapY(Y_BASE_FOLDINNER_MAIN_T);
      const topFoldInnerPivot = new THREE.Group();
      attachAtAnchor(topFoldInnerPivot, partGroups.baseFoldInnerTop,
        0, topFoldInnerAbsZ, 0, topFoldInnerAbsZ);
  
      const topMidAbsZ = mapY(Y_BASE_MID_FOLDINNER_T);
      const topMidPanelPivot = new THREE.Group();
      attachAtAnchor(topMidPanelPivot, partGroups.baseMidTop,
        0, topMidAbsZ - topFoldInnerAbsZ, 0, topMidAbsZ);
  
      const topFoldOuterAbsZ = mapY(Y_BASE_FOLDOUTER_MID_T);
      const topFoldOuterPivot = new THREE.Group();
      attachAtAnchor(topFoldOuterPivot, partGroups.baseFoldOuterTop,
        0, topFoldOuterAbsZ - topMidAbsZ, 0, topFoldOuterAbsZ);
  
      topMidPanelPivot.add(topFoldOuterPivot);
      topFoldInnerPivot.add(topMidPanelPivot);
      root.add(topFoldInnerPivot);
  
      // ── BASE 底部折叠堆叠：镜像，逻辑同上 ─────────────────────────
      const botFoldInnerAbsZ = mapY(Y_BASE_MAIN_FOLDINNER_B);
      const botFoldInnerPivot = new THREE.Group();
      attachAtAnchor(botFoldInnerPivot, partGroups.baseFoldInnerBot,
        0, botFoldInnerAbsZ, 0, botFoldInnerAbsZ);
  
      const botMidAbsZ = mapY(Y_BASE_FOLDINNER_MID_B);
      const botMidPanelPivot = new THREE.Group();
      attachAtAnchor(botMidPanelPivot, partGroups.baseMidBot,
        0, botMidAbsZ - botFoldInnerAbsZ, 0, botMidAbsZ);
  
      const botFoldOuterAbsZ = mapY(Y_BASE_MID_FOLDOUTER_B);
      const botFoldOuterPivot = new THREE.Group();
      attachAtAnchor(botFoldOuterPivot, partGroups.baseFoldOuterBot,
        0, botFoldOuterAbsZ - botMidAbsZ, 0, botFoldOuterAbsZ);
  
      botMidPanelPivot.add(botFoldOuterPivot);
      botFoldInnerPivot.add(botMidPanelPivot);
      root.add(botFoldInnerPivot);
  
      const flatWidth = Math.max(...targetX) - Math.min(...targetX);
      const flatDepth = Math.max(...targetY) - Math.min(...targetY);
      const centerX = (Math.max(...targetX) + Math.min(...targetX)) / 2;
      const centerZ = (Math.max(...targetY) + Math.min(...targetY)) / 2;
      root.position.x = -centerX;
      root.position.z = -centerZ;
  
      return {
        root,
        dimensions: { L: resolved.L, W: resolved.W, H: resolved.D },
        flatWidth,
        flatDepth,
        parts: {
          baseSideGroupPivot, baseSideEarTopPivot, baseSideEarBotPivot,
          hingeGroupPivot, hingeEarTopPivot, hingeEarBotPivot,
          lidGroupPivot, lidFrontPivot, lidBackPivot,
          lidSidePivot, lidSideEarTopPivot, lidSideEarBotPivot,
          topFoldInnerPivot, topMidPanelPivot, topFoldOuterPivot,
          botFoldInnerPivot, botMidPanelPivot, botFoldOuterPivot
        }
      };
    }
  
    window.Pizza3DModel = { buildPizza3DModel };
  })();