let selectedBox = "";
let selectedLayer = "";
let selectedMaterialFactor = null;
let selectedBoxImage = "";
let previewMode = "2d";
let selectedDimensionMode = "ED";

const JLC_PIZZA_MODEL = {
  source: "JLC /api/box/front/type/get",
  sourceDate: "2026-03-07",
  typeId: "382814600598241282",
  templateId: "W3",
  defaults: {
    L: 200,
    W: 150,
    D: 50,
    X: 2
  },
  limits: {
    L: { min: 50, max: 1000 },
    W: { min: 40, maxBy: "L" },
    D: { min: 25, maxBy: "W" }
  }
};
const JLC_RSC_MODEL = {
  source: 'JLC /api/box/front/type/get',
  sourceDate: '2026-03-09',
  typeId: '475451852259971073',
  templateId: 'W1-1',
  defaults: {
    L: 300,
    W: 100,
    H: 100
  },
  limits: {
    L: { min: 70, max: 2000 },
    W: { min: 55, max: 2000, maxBy: 'L' },
    H: { min: 60, max: 2000 }
  },
  dieAllowance: {
    L: 4,
    W: 4,
    H: 8.3
  },
  unitScale: 72 / 25.4,
  origin: {
    x: 113.39,
    y: 184.25
  },
  outerPad: 14.2,
  rightBevelY: 29,
  rightTabWidth: {
    min: 103.9,
    max: 118.1
  },
  slot: {
    width: 6,
    radius: 3
  }
};

const JLC_GIFT_MODEL = {
  source: 'JLC /api/box/front/type/get',
  sourceDate: '2026-03-28',
  typeId: '391879432383459329',
  templateId: 'K9',
  defaults: {
    L: 120,
    W: 80,
    H: 150
  },
  limits: {
    L: { min: 40, max: 800 },
    W: { min: 30, max: 800, maxBy: 'L' },
    H: { min: 40, max: 800 }
  }
};

const GIFT_REFERENCE_TEMPLATE = {
  refDims: {
    L: 120,
    W: 80,
    H: 150
  },
  viewBox: {
    x: 0,
    y: 0,
    width: 1260.99,
    height: 943.24
  },
  baseX: [0.14, 240.94, 599.81, 845.29, 1204.16, 1260.85],
  baseY: [0.14, 300.91, 310.27, 758.99, 943.1]
};

const GIFT_AXIS_STOPS = {
  x1ByW: [[40, 127.56], [80, 240.94], [500, 1431.5], [800, 2281.89]],
  x2SpanByL: [[40, 132.09], [120, 358.87], [500, 1436.03], [800, 2286.42]],
  x3SpanByW: [[40, 132.1], [80, 245.48], [500, 1439.15], [800, 2286.43]],
  x4SpanByL: [[40, 132.09], [120, 358.87], [500, 1429.79], [800, 2286.43]],
  x5SpanByW: [[40, 51.03], [80, 56.69], [500, 116.51], [800, 113.38]],
  y1ByW: [[40, 181.86], [80, 300.91], [500, 1548.16], [800, 2398.55]],
  y2Span: 9.36,
  y3SpanByH: [[40, 136.91], [100, 306.99], [150, 448.72], [800, 2291.25]],
  y4SpanByW: [[40, 99.08], [80, 184.11], [500, 1005.22], [800, 1600.5]]
};

const FIVE_PANEL_REFERENCE_TEMPLATE = {
  // 2026-07-02 修正：之前这里 L/W/H 标签搞反了。按"折叠成型后 L > W > H"的
  // 惯例来看，应该是 L=200（最长）、W=150（居中）、H=50（最短），
  // 而不是之前误写的 L=150/W=50/H=200。
  refDims: {
    L: 200,
    W: 150,
    H: 50
  },
  viewBox: {
    x: 0,
    y: 0,
    width: 1380.99,
    height: 879.74
  },
  // 正确模板的关键竖向分界：
  // [W][固定过渡][L][固定过渡][W][固定过渡][L][固定过渡][W]
  baseX: [22.69, 164.42, 181.43, 606.63, 623.64, 765.37, 782.38, 1207.58, 1224.59, 1366.32],
  // 正确模板的关键横向分界：
  // [顶部W][固定过渡][主体H][底部W]
  baseY: [14.67, 156.41, 162.42, 723.33, 865.07]
};

let fivePanelTemplateCachePromise = null;

let giftTemplateCachePromise = null;

// 备注（2026-07-02）：这个函数目前只给旧版 Gift Box 参考模板解析逻辑
// （classifyGiftLine 等）使用。Web2 那边已经没有这个函数了，因为它把
// Gift Box 换成了官方 JLC 数据源 + 插值表的新方案，不再需要逐线比对参考模板。
// 等本项目也把 Gift Box 数据模型换成 Web2 那套（计划中的"第三步"）之后，
// 这个函数大概率会变成没人调用的死代码，到时候记得一并清理，先不要直接删。
function approxEq(a, b, tolerance = 0.9) {
  return Math.abs(a - b) <= tolerance;
}

// 按分段线性插值表(stops)算出 value 对应的插值结果，stops 格式：[[x0,y0],[x1,y1],...]
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

function buildFivePanelTargetAxes(L, W, H) {
  const ref = FIVE_PANEL_REFERENCE_TEMPLATE;

  // 2026-07-02 修正：横向"窄边"面板和顶/底翼片实际对应的是 H(高度)，
  // 横向"宽边"面板对应的是 W(宽度)，纵向主体(展开图里最长的一段)对应的才是 L(长度)。
  // 之前这里跟 refDims 一样，三个参数的角色被搞反了，现在按验证过的正确对应关系改。
  const sxNarrow = H / ref.refDims.H;
  const sxWide = W / ref.refDims.W;
  const syMain = L / ref.refDims.L;
  const syFlap = H / ref.refDims.H;

  // X 方向：
  // [W][固定过渡][L][固定过渡][W][固定过渡][L][固定过渡][W]
  const x0 = ref.baseX[0];
  const x1 = x0 + ((ref.baseX[1] - ref.baseX[0]) * sxNarrow);
  const x2 = x1 + (ref.baseX[2] - ref.baseX[1]);
  const x3 = x2 + ((ref.baseX[3] - ref.baseX[2]) * sxWide);
  const x4 = x3 + (ref.baseX[4] - ref.baseX[3]);
  const x5 = x4 + ((ref.baseX[5] - ref.baseX[4]) * sxNarrow);
  const x6 = x5 + (ref.baseX[6] - ref.baseX[5]);
  const x7 = x6 + ((ref.baseX[7] - ref.baseX[6]) * sxWide);
  const x8 = x7 + (ref.baseX[8] - ref.baseX[7]);
  const x9 = x8 + ((ref.baseX[9] - ref.baseX[8]) * sxNarrow);

  // Y 方向：
  // [顶部W][固定过渡][主体H][底部W]
  const y0 = ref.baseY[0];
  const y1 = y0 + ((ref.baseY[1] - ref.baseY[0]) * syFlap);
  const y2 = y1 + (ref.baseY[2] - ref.baseY[1]);
  const y3 = y2 + ((ref.baseY[3] - ref.baseY[2]) * syMain);
  const y4 = y3 + ((ref.baseY[4] - ref.baseY[3]) * syFlap);

  return {
    targetX: [x0, x1, x2, x3, x4, x5, x6, x7, x8, x9],
    targetY: [y0, y1, y2, y3, y4]
  };
}

async function loadGiftReferenceTemplate() {
  if (giftTemplateCachePromise) {
    return giftTemplateCachePromise;
  }

  giftTemplateCachePromise = Promise.resolve().then(() => {
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

    return { lineElements, pathElements };
  });

  return giftTemplateCachePromise;
}

async function loadFivePanelReferenceTemplate() {
  if (fivePanelTemplateCachePromise) {
    return fivePanelTemplateCachePromise;
  }

  fivePanelTemplateCachePromise = Promise.resolve().then(() => {
    const svgText = window.FIVE_PANEL_TEMPLATE_SVG;

    if (!svgText || !svgText.trim()) {
      throw new Error("5 Panel Box SVG template text is empty or not loaded.");
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

    return { lineElements, pathElements };
  });

  return fivePanelTemplateCachePromise;
}

// 新版 gift-box-template.js 里只有 cls-1(折叠线)和其它(切割线)两种，
// 不再需要靠坐标位置去猜哪条是折叠线(approxEq 那套旧逻辑不再需要，见 approxEq 上方备注)
function classifyGiftLine(line) {
  if (line.className === "cls-1") {
    return "pizza-fold";
  }

  return "pizza-cut";
}

function classifyFivePanelLine(line) {
  if (line.className === "cls-2") {
    return "five-fold";
  }
  return "five-inner";
}

function classifyGiftPath(pathItem) {
  return "pizza-cut";
}

function classifyFivePanelPath(pathItem) {
  if (pathItem.className === "cls-2") {
    return "five-fold";
  }
  return "five-inner";
}

function buildGiftDimOverlay(targetAxes, L, W, H) {
  const x = targetAxes.targetX;
  const y = targetAxes.targetY;

  const plotWidth = x[4] - x[0];
  const plotHeight = y[4] - y[0];
  const scale = Math.max(plotWidth / 1350, plotHeight / 1050);
  const dimFontSize = clamp(20 * scale, 12, 30);
  const dimYOffset = dimFontSize * 0.5;
  const dimXOffset = dimFontSize * 0.46;

  const bodyTop = y[2];
  const bodyBottom = y[3];
  const dimYL = bodyTop + ((bodyBottom - bodyTop) * 0.66);
  const dimYW = bodyTop + ((bodyBottom - bodyTop) * 0.82);
  const dimHX = x[0] + ((x[1] - x[0]) * 0.32);

  return `
    <line class="pizza-dim-guide" x1="${fmtNum(x[0])}" y1="${fmtNum(bodyTop)}" x2="${fmtNum(x[0])}" y2="${fmtNum(bodyBottom)}"></line>
    <line class="pizza-dim-guide" x1="${fmtNum(x[1])}" y1="${fmtNum(bodyTop)}" x2="${fmtNum(x[1])}" y2="${fmtNum(bodyBottom)}"></line>
    <line class="pizza-dim-guide" x1="${fmtNum(x[2])}" y1="${fmtNum(bodyTop)}" x2="${fmtNum(x[2])}" y2="${fmtNum(bodyBottom)}"></line>

    <line class="pizza-dim-line" x1="${fmtNum(x[1])}" y1="${fmtNum(dimYL)}" x2="${fmtNum(x[2])}" y2="${fmtNum(dimYL)}"></line>
    <line class="pizza-dim-line" x1="${fmtNum(x[0])}" y1="${fmtNum(dimYW)}" x2="${fmtNum(x[1])}" y2="${fmtNum(dimYW)}"></line>
    <line class="pizza-dim-line" x1="${fmtNum(dimHX)}" y1="${fmtNum(bodyTop)}" x2="${fmtNum(dimHX)}" y2="${fmtNum(bodyBottom)}"></line>

    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum((x[1] + x[2]) / 2)}" y="${fmtNum(dimYL - dimYOffset)}" text-anchor="middle">L=${Math.round(L)}mm</text>
    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum((x[0] + x[1]) / 2)}" y="${fmtNum(dimYW - dimYOffset)}" text-anchor="middle">W=${Math.round(W)}mm</text>
    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum(dimHX + dimXOffset)}" y="${fmtNum((bodyTop + bodyBottom) / 2)}" text-anchor="middle" transform="rotate(-90 ${fmtNum(dimHX + dimXOffset)} ${fmtNum((bodyTop + bodyBottom) / 2)})">H=${Math.round(H)}mm</text>
  `;
}

function buildFivePanelDimOverlay(targetAxes, L, W, H) {
  const x = targetAxes.targetX;
  const y = targetAxes.targetY;

  const dimFontSize = 42;
  const dimYOffset = dimFontSize * 0.55;
  const dimXOffset = dimFontSize * 0.5;

  // 主体区从 y1 到 y3
  const dimYL = y[1] + ((y[3] - y[1]) * 0.62);
  const dimYW = y[1] + ((y[3] - y[1]) * 0.80);
  const dimHX = x[0] + ((x[1] - x[0]) * 0.26);

  return `
    <line class="pizza-dim-guide" x1="${fmtNum(x[0])}" y1="${fmtNum(y[1])}" x2="${fmtNum(x[0])}" y2="${fmtNum(y[3])}"></line>
    <line class="pizza-dim-guide" x1="${fmtNum(x[1])}" y1="${fmtNum(y[1])}" x2="${fmtNum(x[1])}" y2="${fmtNum(y[3])}"></line>
    <line class="pizza-dim-guide" x1="${fmtNum(x[2])}" y1="${fmtNum(y[1])}" x2="${fmtNum(x[2])}" y2="${fmtNum(y[3])}"></line>
    <line class="pizza-dim-guide" x1="${fmtNum(x[3])}" y1="${fmtNum(y[1])}" x2="${fmtNum(x[3])}" y2="${fmtNum(y[3])}"></line>

    <line class="pizza-dim-line" x1="${fmtNum(x[2])}" y1="${fmtNum(dimYL)}" x2="${fmtNum(x[3])}" y2="${fmtNum(dimYL)}"></line>
    <line class="pizza-dim-line" x1="${fmtNum(x[0])}" y1="${fmtNum(dimYW)}" x2="${fmtNum(x[1])}" y2="${fmtNum(dimYW)}"></line>
    <line class="pizza-dim-line" x1="${fmtNum(dimHX)}" y1="${fmtNum(y[1])}" x2="${fmtNum(dimHX)}" y2="${fmtNum(y[3])}"></line>

    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum((x[2] + x[3]) / 2)}" y="${fmtNum(dimYL - dimYOffset)}" text-anchor="middle">W=${Math.round(W)}mm</text>
    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum((x[0] + x[1]) / 2)}" y="${fmtNum(dimYW - dimYOffset)}" text-anchor="middle">H=${Math.round(H)}mm</text>
    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum(dimHX + dimXOffset)}" y="${fmtNum((y[1] + y[3]) / 2)}" text-anchor="middle" transform="rotate(-90 ${fmtNum(dimHX + dimXOffset)} ${fmtNum((y[1] + y[3]) / 2)})">L=${Math.round(L)}mm</text>
  `;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function valueOrDefault(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatDisplayValue(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value.toFixed(2)).toString();
}

function getRSCParcelSize(L, W, H, layer, quantity) {
  const thicknessPerPiece = layer === 5 ? 15 : 10;

  return {
    L: 40 + L + W,
    W: W + H + 50,
    H: thicknessPerPiece * quantity
  };
}

function getFivePanelParcelSize(L, W, H, layer, quantity) {
  const thicknessPerPiece = layer === 5 ? 7.5 : 5;

  return {
    L: (2 * W) + (3 * H),
    W: (L + (2 * H)) + 50,
    H: thicknessPerPiece * quantity
  };
}

function getPizzaParcelSize(L, W, H, quantity) {
  return {
    L: ((H * 3) + (W * 2)) + 60,
    W: ((L + 32) + ((H * 2) + 20 + ((H + 3) * 2) + 12)) + 50,
    H: 4 * quantity
  };
}

function getGiftParcelSize(L, W, H, quantity) {
  return {
    L: L + W + 10,
    W: H + W + W + 40,
    H: 8 * quantity
  };
}

function getRSCParcelWeight(parcelSize) {
  const lengthCm = parcelSize.L / 10;
  const widthCm = parcelSize.W / 10;
  const heightCm = parcelSize.H / 10;

  return (lengthCm * widthCm * heightCm) / 5000;
}

function getEstimatedDeliveryFee(parcelWeight) {
  return Math.ceil(parcelWeight / 30) * 20;
}

function getParcelCount(parcelWeight) {
  return Math.max(1, Math.ceil(parcelWeight / 30));
}

function resolvePizzaInput(L, W, H) {
  const model = JLC_PIZZA_MODEL;
  const x = model.defaults.X;

  const l = clamp(
    valueOrDefault(L, model.defaults.L),
    model.limits.L.min,
    model.limits.L.max
  );

  const w = clamp(
    valueOrDefault(W, model.defaults.W),
    model.limits.W.min,
    l
  );

  const d = clamp(
    valueOrDefault(H, model.defaults.D),
    model.limits.D.min,
    w + x
  );

  return { L: l, W: w, D: d, X: x };
}
function resolveRSCInput(L, W, H) {
  const model = JLC_RSC_MODEL;

  const l = clamp(
    valueOrDefault(L, model.defaults.L),
    1,
    model.limits.L.max
  );

  const w = clamp(
    valueOrDefault(W, model.defaults.W),
    1,
    model.limits.W.max
  );

  const h = clamp(
    valueOrDefault(H, model.defaults.H),
    1,
    model.limits.H.max
  );

  return { L: l, W: w, H: h };
}

function resolveGiftInput(L, W, H) {
  const model = JLC_GIFT_MODEL;

  const l = clamp(
    valueOrDefault(L, model.defaults.L),
    model.limits.L.min,
    model.limits.L.max
  );

  const w = clamp(
    valueOrDefault(W, model.defaults.W),
    model.limits.W.min,
    Math.min(model.limits.W.max, l)
  );

  const h = clamp(
    valueOrDefault(H, model.defaults.H),
    model.limits.H.min,
    model.limits.H.max
  );

  return { L: l, W: w, H: h };
}

function getBoxDefaultDimensions(type) {
  if (type === "Pizza Box") {
    return {
      L: JLC_PIZZA_MODEL.defaults.L,
      W: JLC_PIZZA_MODEL.defaults.W,
      H: JLC_PIZZA_MODEL.defaults.D
    };
  }

  if (type === "RSC Box") {
    return { ...JLC_RSC_MODEL.defaults };
  }

  if (type === "Gift Box") {
    return { ...JLC_GIFT_MODEL.defaults };
  }

  if (type === "5 Panel Box") {
    return { ...FIVE_PANEL_REFERENCE_TEMPLATE.refDims };
  }

  return { L: 0, W: 0, H: 0 };
}

// 切换箱型时，把 L/W/H 输入框清空，用该箱型的默认值当占位文字显示
// 注意：数量框(qty)这里特意不设默认值，保持空白只显示提示文字，跟原有做法一致
function applyBoxDefaultInputs(type) {
  const dims = getBoxDefaultDimensions(type);
  const lengthInput = document.getElementById("length");
  const widthInput = document.getElementById("width");
  const heightInput = document.getElementById("height");

  lengthInput.value = "";
  widthInput.value = "";
  heightInput.value = "";

  lengthInput.placeholder = dims.L || "";
  widthInput.placeholder = dims.W || "";
  heightInput.placeholder = dims.H || "";
}

// 判断该箱型是否支持 ED(外径)/ID(内径)切换，目前只有 RSC Box 和 5 Panel Box 支持
function supportsDimensionMode(type) {
  return type === "RSC Box" || type === "5 Panel Box";
}

// 根据当前选中的箱型，更新 ED/ID 按钮的显示状态
function syncDimensionModeControls() {
  const block = document.getElementById("dimensionModeBlock");
  const edButton = document.getElementById("dimModeED");
  const idButton = document.getElementById("dimModeID");

  if (!block || !edButton || !idButton) {
    return;
  }

  block.style.display = selectedBox ? "block" : "none";

  if (!supportsDimensionMode(selectedBox)) {
    selectedDimensionMode = "ID";
    edButton.style.display = "none";
    idButton.style.display = "inline-block";
    edButton.disabled = true;
    idButton.disabled = true;
  } else {
    edButton.style.display = "inline-block";
    idButton.style.display = "inline-block";
    edButton.disabled = false;
    idButton.disabled = false;
  }

  edButton.classList.toggle("active", selectedDimensionMode === "ED");
  idButton.classList.toggle("active", selectedDimensionMode === "ID");
}

function selectDimensionMode(mode) {
  selectedDimensionMode = mode === "ID" ? "ID" : "ED";
  syncDimensionModeControls();
  calculatePrice();
}

// 如果当前是 ID(内径)模式，把用户输入的内径尺寸换算成外径尺寸用于报价计算；
// ED(外径)模式直接原样返回，不做换算
function getQuotationDimensions(boxType, L, W, H, layer) {
  if (selectedDimensionMode !== "ID") {
    return { L, W, H };
  }

  let allowance = { L: 0, W: 0, H: 0 };

  if (boxType === "RSC Box") {
    allowance = layer === 5
      ? { L: 7, W: 7, H: 15 }
      : { L: 4, W: 4, H: 8 };
  }

  if (boxType === "5 Panel Box") {
    allowance = layer === 5
      ? { L: 14, W: 10, H: 10 }
      : { L: 8, W: 5, H: 5 };
  }

  return {
    L: L + allowance.L,
    W: W + allowance.W,
    H: H + allowance.H
  };
}

function updateDimensionChips(L, W, H) {
  document.getElementById("dimL").innerText = "L: " + (L > 0 ? L : "--") + " mm";
  document.getElementById("dimW").innerText = "W: " + (W > 0 ? W : "--") + " mm";
  document.getElementById("dimH").innerText = "H: " + (H > 0 ? H : "--") + " mm";
  document.getElementById("dimType").innerText = "Type: " + (selectedBox || "--");
}

function getCurrentInputDimensions() {
  const defaults = getBoxDefaultDimensions(selectedBox);
  return {
    L: parseFloat(document.getElementById("length").value) || defaults.L || 0,
    W: parseFloat(document.getElementById("width").value) || defaults.W || 0,
    H: parseFloat(document.getElementById("height").value) || defaults.H || 0
  };
}

function syncPreviewPanelHeading() {
  const title = document.getElementById("previewPanelTitle");
  const subtitle = document.getElementById("previewPanelSubtitle");

  if (!title || !subtitle) {
    return;
  }

  if (previewMode === "3d") {
    title.textContent = "3D Preview";
    subtitle.textContent = "Parametric folding preview with live L/W/H updates";
  } else {
    title.textContent = "2D SVG Preview";
    subtitle.textContent = "Parametric die line with live L/W/H updates";
  }
}

function syncPreviewModeButtons() {
  const btn2D = document.getElementById("previewMode2D");
  const btn3D = document.getElementById("previewMode3D");
  const note = document.getElementById("previewNote");

  if (!btn2D || !btn3D || !note) {
    return;
  }

  btn2D.classList.toggle("active", previewMode === "2d");
  btn3D.classList.toggle("active", previewMode === "3d");

  const supports3D = selectedBox === "RSC Box" || selectedBox === "5 Panel Box" || selectedBox === "Pizza Box" || selectedBox === "Gift Box";
  btn3D.disabled = !supports3D;

  if (previewMode === "3d") {
    let label3D = "3D preview is currently available for RSC Box, 5 Panel Box, Pizza Box, and Gift Box only.";
    if (selectedBox === "RSC Box") {
      label3D = "RSC Box 3D preview: drag to rotate, pause to zoom, and use the slider to inspect any folding frame.";
    } else if (selectedBox === "5 Panel Box") {
      label3D = "5 Panel Box 3D preview: drag to rotate and zoom to inspect the flat die line. Folding animation is coming soon.";
    } else if (selectedBox === "Pizza Box") {
      label3D = "Pizza Box 3D preview: drag to rotate, pause to zoom, and use the slider to inspect any folding frame.";
    } else if (selectedBox === "Gift Box") {
      label3D = "Gift Box 3D preview: drag to rotate, pause to zoom, and use the slider to inspect any folding frame.";
    }
    note.textContent = label3D;
  } else {
    note.textContent = "Pizza Box + RSC Box 2D preview uses your provided architecture and redraws lines in real time from your inputs.";
  }
}

function applyPreviewModeVisibility() {
  const stage2D = document.getElementById("previewStage");
  const stage3D = document.getElementById("preview3DStage");

  if (!stage2D || !stage3D) {
    return;
  }

  const show3D = previewMode === "3d";
  stage2D.classList.toggle("is-hidden", show3D);
  stage3D.classList.toggle("is-hidden", !show3D);
}

function switchPreviewMode(mode) {
  previewMode = mode === "3d" ? "3d" : "2d";
  syncPreviewModeButtons();
  syncPreviewPanelHeading();
  applyPreviewModeVisibility();
  renderActivePreview();
}

function render3DPreview() {
  const dims = getCurrentInputDimensions();

  if (selectedBox === "RSC Box") {
    window.RSC3DPreview.mountRSC(dims);
    updateDimensionChips(dims.L, dims.W, dims.H);
    return;
  }

  if (selectedBox === "5 Panel Box") {
    window.FivePanel3DPreview.mountFivePanel(dims);
    updateDimensionChips(dims.L, dims.W, dims.H);
    return;
  }

  if (selectedBox === "Pizza Box") {
    window.Pizza3DPreview.mountPizza(dims);
    updateDimensionChips(dims.L, dims.W, dims.H);
    return;
  }

  if (selectedBox === "Gift Box") {
    window.Gift3DPreview.mountGift(dims);
    updateDimensionChips(dims.L, dims.W, dims.H);
    return;
  }

  window.RSC3DPreview.showUnsupported("3D preview is currently available for RSC Box, 5 Panel Box, Pizza Box, and Gift Box only.");
  updateDimensionChips(dims.L, dims.W, dims.H);
}

function renderActivePreview() {
  if (previewMode === "3d") {
    render3DPreview();
    return;
  }

  window.RSC3DPreview.hide();
  render2DPreview();
}

function selectBox(type, img) {
  selectedBox = type;
  selectedBoxImage = img;

  document.getElementById("selectedImage").src = img;
  document.getElementById("selectedTitle").innerText = type;

  document.getElementById("page1").style.display = "none";
  document.getElementById("page2").style.display = "block";

  selectedLayer = "";
  selectedMaterialFactor = null;
  selectedDimensionMode = supportsDimensionMode(type) ? "ED" : "ID";

  document.getElementById("materialOptions").innerHTML = "";
  document.getElementById("result").innerHTML = "";

  document.getElementById("btn3").classList.remove("active");
  document.getElementById("btn5").classList.remove("active");

  if (type === "Pizza Box" || type === "Gift Box") {
    document.getElementById("btn5").style.display = "none";
  } else {
    document.getElementById("btn5").style.display = "inline-block";
  }

  applyBoxDefaultInputs(type);
  syncDimensionModeControls();

  previewMode = "2d";
  syncPreviewModeButtons();
  syncPreviewPanelHeading();
  applyPreviewModeVisibility();
  renderActivePreview();
}

function goBack() {
  document.getElementById("page1").style.display = "block";
  document.getElementById("page2").style.display = "none";
  previewMode = "2d";
  syncPreviewModeButtons();
  syncPreviewPanelHeading();
  applyPreviewModeVisibility();
  window.RSC3DPreview.hide();
}

function selectLayer(btn, layer) {
  document.getElementById("btn3").classList.remove("active");
  document.getElementById("btn5").classList.remove("active");
  btn.classList.add("active");

  selectedLayer = layer;
  selectedMaterialFactor = null;

  const materialDiv = document.getElementById("materialOptions");
  materialDiv.innerHTML = "<strong>Select Material</strong><br>";

  let materials = {};
  if (layer === 3) {
    materials = {
      "60 LBS": 1.5 * 1.2,
      "100 LBS": 1.8 * 1.2,
      "150 LBS": 2.5 * 1.2
    };
  } else {
    materials = {
      "100 LBS": 2.3 * 1.2,
      "150 LBS": 2.7 * 1.2,
      "200 LBS": 3.1 * 1.2
    };
  }

  for (const name in materials) {
    const mbtn = document.createElement("button");
    mbtn.className = "option-btn";
    mbtn.innerText = name;

    mbtn.onclick = function () {
      document.querySelectorAll("#materialOptions .option-btn").forEach((b) => b.classList.remove("active"));
      mbtn.classList.add("active");

      selectedMaterialFactor = {
        name: name,
        factor: materials[name]
      };

      calculatePrice();
    };

    materialDiv.appendChild(mbtn);
  }
}

function calculatePrice() {
  const inputL = parseFloat(document.getElementById("length").value);
  const inputW = parseFloat(document.getElementById("width").value);
  const inputH = parseFloat(document.getElementById("height").value);
  const quantity = parseFloat(document.getElementById("qty").value);

  renderActivePreview();

  if (!inputL || !inputW || !inputH || !quantity || !selectedMaterialFactor) {
    return;
  }

  // ED(外径)模式下 L/W/H 直接用；ID(内径)模式下换算成外径尺寸再往下算
  const quoteDims = supportsDimensionMode(selectedBox)
    ? getQuotationDimensions(selectedBox, inputL, inputW, inputH, selectedLayer)
    : { L: inputL, W: inputW, H: inputH };
  const L = quoteDims.L;
  const W = quoteDims.W;
  const H = quoteDims.H;

  if (quantity < 30) {
    document.getElementById("result").innerHTML =
      "<span style='color:#bc1f35;font-weight:700'>Minimum order quantity is 30.</span>";
    return;
  }

  if (selectedBox === "Pizza Box") {
    const maxH = W + JLC_PIZZA_MODEL.defaults.X;
    if (L < 50 || L > 1000) {
      document.getElementById("result").innerHTML =
        "<span style='color:#bc1f35;font-weight:700'>Pizza Box length must be between 50 and 1000 mm.</span>";
      return;
    }
    if (W < 40 || W > L) {
      document.getElementById("result").innerHTML =
        "<span style='color:#bc1f35;font-weight:700'>Pizza Box width must be between 40 mm and " + (Math.round(L * 100) / 100) + " mm.</span>";
      return;
    }
    if (H < 25 || H > maxH) {
      document.getElementById("result").innerHTML =
        "<span style='color:#bc1f35;font-weight:700'>Pizza Box height must be between 25 mm and " + (Math.round(maxH * 100) / 100) + " mm.</span>";
      return;
    }
  }

  if (selectedBox === 'RSC Box') {
    const maxW = L;
    if (L < JLC_RSC_MODEL.limits.L.min || L > JLC_RSC_MODEL.limits.L.max) {
      document.getElementById('result').innerHTML =
        "<span style='color:#bc1f35;font-weight:700'>RSC Box length must be between " +
        JLC_RSC_MODEL.limits.L.min + ' mm and ' + JLC_RSC_MODEL.limits.L.max + ' mm.</span>';
      return;
    }
    if (W < JLC_RSC_MODEL.limits.W.min || W > maxW) {
      document.getElementById('result').innerHTML =
        "<span style='color:#bc1f35;font-weight:700'>RSC Box width must be between " +
        JLC_RSC_MODEL.limits.W.min + ' mm and ' + (Math.round(maxW * 100) / 100) + ' mm.</span>';
      return;
    }
    if (H < JLC_RSC_MODEL.limits.H.min || H > JLC_RSC_MODEL.limits.H.max) {
      document.getElementById('result').innerHTML =
        "<span style='color:#bc1f35;font-weight:700'>RSC Box height must be between " +
        JLC_RSC_MODEL.limits.H.min + ' mm and ' + JLC_RSC_MODEL.limits.H.max + ' mm.</span>';
      return;
    }
  }
  if ((selectedBox === "Pizza Box" || selectedBox === "5 Panel Box" || selectedBox === "RSC Box") && W > L) {
    document.getElementById("result").innerHTML =
      "<span style='color:#bc1f35;font-weight:700'>Width cannot be greater than Length for this box type.</span>";
    return;
  }

  let area = 0;
  if (selectedBox === "RSC Box") {
    area = ((40 + 2 * L + 2 * W) / 1000) * ((W + H + 50) / 1000);
  } else if (selectedBox === "5 Panel Box") {
    area = ((2 * W + 3 * H) / 1000) * (((L + 2 * H) + 50) / 1000);
  } else if (selectedBox === "Pizza Box") {
    area = (((H * 3) + (W * 2) + 60) / 1000) * (((L + 32) + ((H * 2) + 20 + ((H + 3) * 2) + 12) + 50) / 1000);
  } else if (selectedBox === "Gift Box") {
    area = (((L * 2) + (W * 2) + 20 + 30) / 1000) * (((W + H + 20) + ((W / 2) + 20 + 30)) / 1000);
  }

  const cost = area * selectedMaterialFactor.factor;
  let price = Math.min(cost * 2.2, cost + 5);

  if (selectedLayer === 3) {
    price = Math.max(price, 1.0);
  } else if (selectedLayer === 5) {
    price = Math.max(price, 1.5);
  }

  let discountRate = 0;
  if (quantity >= 1000) {
    discountRate = 0.2;
  } else if (quantity >= 500) {
    discountRate = 0.15;
  } else if (quantity >= 100) {
    discountRate = 0.1;
  }

  let discountedPrice = price * (1 - discountRate);
  discountedPrice = Math.ceil(discountedPrice / 0.05) * 0.05;

  const total = discountedPrice * quantity;
  let discountText = "";
  if (discountRate > 0) {
    discountText = "Discount: " + (discountRate * 100) + "% " +
      "<span style='background:#00a79d;color:white;padding:3px 8px;border-radius:999px;font-size:12px;'>APPROVED</span>";
  }

  // 物流运费预估：按箱型算出打包后的包裹尺寸，再推算重量、运费和包裹数量
  let logisticsHtml = "";
  if (selectedBox === "RSC Box" || selectedBox === "5 Panel Box" || selectedBox === "Pizza Box" || selectedBox === "Gift Box") {
    const parcelSize = selectedBox === "RSC Box"
      ? getRSCParcelSize(L, W, H, selectedLayer, quantity)
      : selectedBox === "5 Panel Box"
        ? getFivePanelParcelSize(L, W, H, selectedLayer, quantity)
        : selectedBox === "Pizza Box"
          ? getPizzaParcelSize(L, W, H, quantity)
          : getGiftParcelSize(L, W, H, quantity);
    const parcelWeight = getRSCParcelWeight(parcelSize);
    const parcelCount = getParcelCount(parcelWeight);
    const estimatedDeliveryFee = getEstimatedDeliveryFee(parcelWeight);

    logisticsHtml =
      '<div class="result-section">' +
      '<div class="result-section-title">Logistics Estimate</div>' +
      '<div class="result-row">Parcel Size : <b>' +
      formatDisplayValue(parcelSize.L) + ' x ' +
      formatDisplayValue(parcelSize.W) + ' x ' +
      formatDisplayValue(parcelSize.H) + ' mm</b></div>' +
      '<div class="result-row">Parcel Weight : <b>' +
      formatDisplayValue(parcelWeight) + ' kg</b></div>' +
      '<div class="result-row">Number of Parcels : <b>' +
      formatDisplayValue(parcelCount) + '</b></div>' +
      '<div class="result-row">Estimate Delivery Fees : <b>RM ' +
      formatDisplayValue(estimatedDeliveryFee) + '</b></div>' +
      '<div class="result-note">Delivery estimate is based on RM20 per 30kg parcel tier.</div>' +
      '</div>';
  }

  // 有 ED/ID 切换的箱型才显示标注，其余箱型统一按 ID 显示（跟原逻辑一致，只是没有切换按钮）
  const dimensionType = supportsDimensionMode(selectedBox) ? selectedDimensionMode : "ID";

  const priceSummaryHtml =
    '<div class="result-section">' +
    '<div class="result-section-title">Quotation Summary</div>' +
    '<div class="result-row">Box Type : <b>' + selectedBox + '</b></div>' +
    '<div class="result-row">Dimension : <b>' +
    dimensionType + ' ' + formatDisplayValue(inputL) + ' x ' + formatDisplayValue(inputW) + ' x ' + formatDisplayValue(inputH) + ' mm</b></div>' +
    '<div class="result-row">QTY : <b>' + formatDisplayValue(quantity) + '</b></div>' +
    '<div class="result-row">Material : <b>' + selectedLayer + ' Layer, ' + selectedMaterialFactor.name + '</b></div>' +
    '<div class="result-row">Unit Price : <b>RM ' + discountedPrice.toFixed(2) + '</b></div>' +
    '<div class="result-row">Total Price : <b>RM ' + total.toFixed(2) + '</b></div>' +
    '<div class="result-note">Delivery fee is an estimate; actual fee is confirmed upon order.</div>' +
    (discountText ? '<div class="result-note">' + discountText + '</div>' : '') +
    '<div class="result-note">Production Time: <b>5~7 working days</b></div>' +
    '</div>';

  document.getElementById("result").innerHTML = priceSummaryHtml + logisticsHtml;
}

function predictTemplateBAnchors(model, L, W, D) {
  const targetX = model.coeffX.map((coef) => coef[0] * L + coef[1] * W + coef[2] * D + coef[3]);
  const targetY = model.coeffY.map((coef) => coef[0] * L + coef[1] * W + coef[2] * D + coef[3]);
  return {
    x: enforceMonotonic(targetX),
    y: enforceMonotonic(targetY)
  };
}

function enforceMonotonic(values) {
  const out = values.slice();
  for (let i = 1; i < out.length; i++) {
    if (out[i] <= out[i - 1]) {
      out[i] = out[i - 1] + 0.0001;
    }
  }
  return out;
}

function mapAxisPiecewise(value, baseAxis, targetAxis) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const n = baseAxis.length;
  if (n < 2) {
    return value;
  }

  if (value <= baseAxis[0]) {
    const b0 = baseAxis[0];
    const b1 = baseAxis[1];
    const t = (value - b0) / (b1 - b0 || 1);
    return targetAxis[0] + t * (targetAxis[1] - targetAxis[0]);
  }

  if (value >= baseAxis[n - 1]) {
    const b0 = baseAxis[n - 2];
    const b1 = baseAxis[n - 1];
    const t = (value - b0) / (b1 - b0 || 1);
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

function classToPreviewClass(cls) {
  return cls === "cls-3" ? "pizza-cut" : "pizza-fold";
}

function fmtNum(v) {
  return Number(v.toFixed(2)).toString();
}

function calcAdaptiveDimFontSize(vbW, vbH, model) {
  const baseMinX = Math.min(...model.baseX);
  const baseMaxX = Math.max(...model.baseX);
  const baseMinY = Math.min(...model.baseY);
  const baseMaxY = Math.max(...model.baseY);
  const basePad = 40;
  const baseVbW = (baseMaxX - baseMinX) + (basePad * 2);
  const baseVbH = (baseMaxY - baseMinY) + (basePad * 2);
  const scale = Math.max(vbW / baseVbW, vbH / baseVbH);
  return clamp(42 * scale, 30, 140);
}

function calcAdaptiveFontByViewBox(vbW, vbH, baseW, baseH, baseSize, minSize, maxSize) {
  const scale = Math.max(vbW / baseW, vbH / baseH);
  return clamp(baseSize * scale, minSize, maxSize);
}
function createRSCSlotPath(centerX, edgeY, foldY, slotHalf, slotRadius, direction) {
  const sweepFlag = direction === 'top' ? 0 : 1;

  return [
    `M ${fmtNum(centerX - slotHalf)} ${fmtNum(edgeY)}`,
    `L ${fmtNum(centerX - slotHalf)} ${fmtNum(foldY)}`,
    `A ${fmtNum(slotRadius)} ${fmtNum(slotRadius)} 0 0 ${sweepFlag} ${fmtNum(centerX + slotHalf)} ${fmtNum(foldY)}`,
    `L ${fmtNum(centerX + slotHalf)} ${fmtNum(edgeY)}`
  ].join(' ');
}
function tokenizePathData(d) {
  const tokens = [];
  const re = /([a-zA-Z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  let m;

  while ((m = re.exec(d))) {
    if (m[1]) {
      tokens.push({ type: "cmd", value: m[1] });
    } else {
      tokens.push({ type: "num", value: parseFloat(m[2]) });
    }
  }

  return tokens;
}

function transformPathData(d, mapX, mapY) {
  const tokens = tokenizePathData(d);
  const out = [];

  let i = 0;
  let cmd = "";
  let ox = 0;
  let oy = 0;
  let sx = 0;
  let sy = 0;

  const hasNum = () => i < tokens.length && tokens[i].type === "num";
  const readNum = () => tokens[i++].value;

  while (i < tokens.length) {
    if (tokens[i].type === "cmd") {
      cmd = tokens[i].value;
      i += 1;
    }

    if (!cmd) {
      break;
    }

    const up = cmd.toUpperCase();
    const rel = cmd !== up;

    if (up === "Z") {
      out.push("Z");
      ox = sx;
      oy = sy;
      continue;
    }

    if (up === "M") {
      let first = true;
      while (hasNum()) {
        let x = readNum();
        let y = readNum();
        if (rel) {
          x += ox;
          y += oy;
        }
        const tx = mapX(x);
        const ty = mapY(y);
        out.push((first ? "M" : "L") + " " + fmtNum(tx) + " " + fmtNum(ty));
        ox = x;
        oy = y;
        if (first) {
          sx = x;
          sy = y;
          first = false;
        }
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    if (up === "L") {
      while (hasNum()) {
        let x = readNum();
        let y = readNum();
        if (rel) {
          x += ox;
          y += oy;
        }
        out.push("L " + fmtNum(mapX(x)) + " " + fmtNum(mapY(y)));
        ox = x;
        oy = y;
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    if (up === "H") {
      while (hasNum()) {
        let x = readNum();
        if (rel) {
          x += ox;
        }
        out.push("H " + fmtNum(mapX(x)));
        ox = x;
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    if (up === "V") {
      while (hasNum()) {
        let y = readNum();
        if (rel) {
          y += oy;
        }
        out.push("V " + fmtNum(mapY(y)));
        oy = y;
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    if (up === "C") {
      while (hasNum()) {
        let x1 = readNum();
        let y1 = readNum();
        let x2 = readNum();
        let y2 = readNum();
        let x = readNum();
        let y = readNum();

        if (rel) {
          x1 += ox;
          y1 += oy;
          x2 += ox;
          y2 += oy;
          x += ox;
          y += oy;
        }

        out.push(
          "C " +
          fmtNum(mapX(x1)) + " " + fmtNum(mapY(y1)) + " " +
          fmtNum(mapX(x2)) + " " + fmtNum(mapY(y2)) + " " +
          fmtNum(mapX(x)) + " " + fmtNum(mapY(y))
        );

        ox = x;
        oy = y;
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    if (up === "S") {
      while (hasNum()) {
        let x2 = readNum();
        let y2 = readNum();
        let x = readNum();
        let y = readNum();

        if (rel) {
          x2 += ox;
          y2 += oy;
          x += ox;
          y += oy;
        }

        out.push(
          "S " +
          fmtNum(mapX(x2)) + " " + fmtNum(mapY(y2)) + " " +
          fmtNum(mapX(x)) + " " + fmtNum(mapY(y))
        );

        ox = x;
        oy = y;
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    if (up === "Q") {
      while (hasNum()) {
        let x1 = readNum();
        let y1 = readNum();
        let x = readNum();
        let y = readNum();

        if (rel) {
          x1 += ox;
          y1 += oy;
          x += ox;
          y += oy;
        }

        out.push(
          "Q " +
          fmtNum(mapX(x1)) + " " + fmtNum(mapY(y1)) + " " +
          fmtNum(mapX(x)) + " " + fmtNum(mapY(y))
        );

        ox = x;
        oy = y;
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    if (up === "T") {
      while (hasNum()) {
        let x = readNum();
        let y = readNum();

        if (rel) {
          x += ox;
          y += oy;
        }

        out.push("T " + fmtNum(mapX(x)) + " " + fmtNum(mapY(y)));
        ox = x;
        oy = y;
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    if (up === "A") {
      while (hasNum()) {
        const rx = readNum();
        const ry = readNum();
        const rot = readNum();
        const laf = readNum();
        const sf = readNum();
        let x = readNum();
        let y = readNum();

        if (rel) {
          x += ox;
          y += oy;
        }

        out.push(
          "A " + fmtNum(rx) + " " + fmtNum(ry) + " " + fmtNum(rot) + " " +
          fmtNum(laf) + " " + fmtNum(sf) + " " + fmtNum(mapX(x)) + " " + fmtNum(mapY(y))
        );

        ox = x;
        oy = y;
        if (i >= tokens.length || tokens[i].type === "cmd") {
          break;
        }
      }
      continue;
    }

    break;
  }

  return out.join(" ");
}

function createPizzaTemplateBSVG(L, W, H) {
  const model = window.PIZZA_TEMPLATE_B_MODEL;
  if (!model) {
    return {
      html: '<div class="preview-placeholder">Template model not loaded.</div>',
      dims: { L: L || 0, W: W || 0, D: H || 0 }
    };
  }

  const resolved = resolvePizzaInput(L, W, H);
  const l = resolved.L;
  const w = resolved.W;
  const d = resolved.D;

  const predicted = predictTemplateBAnchors(model, l, w, d);
  const targetX = predicted.x;
  const targetY = predicted.y;

  const mapX = (x) => mapAxisPiecewise(x, model.baseX, targetX);
  const mapY = (y) => mapAxisPiecewise(y, model.baseY, targetY);

  const lineSvg = model.lineElements.map((line) => {
    const cls = classToPreviewClass(line.cls);
    const x1 = fmtNum(mapX(line.x1));
    const y1 = fmtNum(mapY(line.y1));
    const x2 = fmtNum(mapX(line.x2));
    const y2 = fmtNum(mapY(line.y2));
    return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
  }).join("\n");

  const pathSvg = model.pathElements.map((p) => {
    const cls = classToPreviewClass(p.cls);
    const td = transformPathData(p.d, mapX, mapY);
    return `<path class="${cls}" d="${td}"></path>`;
  }).join("\n");

  const minX = Math.min(...targetX);
  const maxX = Math.max(...targetX);
  const minY = Math.min(...targetY);
  const maxY = Math.max(...targetY);
  const pad = 40;

  const vbXRaw = minX - pad;
  const vbYRaw = minY - pad;
  const vbWRaw = (maxX - minX) + (pad * 2);
  const vbHRaw = (maxY - minY) + (pad * 2);

  const vbX = fmtNum(vbXRaw);
  const vbY = fmtNum(vbYRaw);
  const vbW = fmtNum(vbWRaw);
  const vbH = fmtNum(vbHRaw);

  const xW0 = targetX[6];
  const xW1 = targetX[14];
  const xD0 = targetX[14];
  const xD1 = targetX[17];
  const yL0 = targetY[23];
  const yL1 = targetY[24];
  const midY = (yL0 + yL1) / 2;
  const dimX = xW0 + (xW1 - xW0) * 0.12;
  const dimFontSize = 42;
  const dimYOffset = dimFontSize * 0.58;
  const dimXOffset = dimFontSize * 0.48;

  const dimOverlay = `
    <line class="pizza-dim-guide" x1="${fmtNum(xW0)}" y1="${fmtNum(yL0)}" x2="${fmtNum(xW0)}" y2="${fmtNum(yL1)}"></line>
    <line class="pizza-dim-guide" x1="${fmtNum(xW1)}" y1="${fmtNum(yL0)}" x2="${fmtNum(xW1)}" y2="${fmtNum(yL1)}"></line>
    <line class="pizza-dim-guide" x1="${fmtNum(xD1)}" y1="${fmtNum(yL0)}" x2="${fmtNum(xD1)}" y2="${fmtNum(yL1)}"></line>

    <line class="pizza-dim-line" x1="${fmtNum(xW0)}" y1="${fmtNum(midY)}" x2="${fmtNum(xW1)}" y2="${fmtNum(midY)}"></line>
    <line class="pizza-dim-line" x1="${fmtNum(xD0)}" y1="${fmtNum(midY)}" x2="${fmtNum(xD1)}" y2="${fmtNum(midY)}"></line>
    <line class="pizza-dim-line" x1="${fmtNum(dimX)}" y1="${fmtNum(yL0)}" x2="${fmtNum(dimX)}" y2="${fmtNum(yL1)}"></line>

    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum((xW0 + xW1) / 2)}" y="${fmtNum(midY - dimYOffset)}" text-anchor="middle">W=${Math.round(w)}mm</text>
    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum((xD0 + xD1) / 2)}" y="${fmtNum(midY - dimYOffset)}" text-anchor="middle">D=${Math.round(d)}mm</text>
    <text class="pizza-dim-text" style="font-size:${fmtNum(dimFontSize)}px" x="${fmtNum(dimX + dimXOffset)}" y="${fmtNum((yL0 + yL1) / 2)}" text-anchor="middle" transform="rotate(-90 ${fmtNum(dimX + dimXOffset)} ${fmtNum((yL0 + yL1) / 2)})">L=${Math.round(l)}mm</text>
  `;

  return {
    html: `
      <div class="pizza-svg-stage">
        <div class="pizza-svg-canvas">
          <svg class="pizza-svg-plot" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" role="img" aria-label="Pizza Box template B die line">
            <defs>
              <marker id="pizzaArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#2f6dff"></path>
              </marker>
            </defs>
            ${lineSvg}
            ${pathSvg}
            ${dimOverlay}
          </svg>
        </div>
        <div class="pizza-svg-caption">
          Template-B dieline: L ${Math.round(l)} x W ${Math.round(w)} x D ${Math.round(d)} mm (from your sample architecture)
        </div>
      </div>
    `,
    dims: { L: l, W: w, D: d }
  };
}

function createRSCTemplateSVG(L, W, H) {
  const model = JLC_RSC_MODEL;
  const resolved = resolveRSCInput(L, W, H);

  const l = resolved.L;
  const w = resolved.W;
  const h = resolved.H;

  const dieL = l + model.dieAllowance.L;
  const dieW = w + model.dieAllowance.W;
  const dieH = h + model.dieAllowance.H;

  const scale = model.unitScale;
  const x0 = model.origin.x;
  const x1 = x0 + (dieW * scale);
  const x2 = x1 + (dieL * scale);
  const x3 = x2 + (dieW * scale);
  const x4 = x3 + (dieL * scale);

  const flapH = ((dieW * 0.5) + 1) * scale;
  const bodyH = dieH * scale;

  const y0 = model.origin.y;
  const y1 = y0 + flapH;
  const y2 = y1 + bodyH;
  const y3 = y2 + flapH;

  const rightTab = clamp((dieH * scale) * 0.14, model.rightTabWidth.min, model.rightTabWidth.max);
  const x5 = x4 + rightTab;

  const slotHalf = (model.slot.width * scale) / 2;
  const slotRadius = model.slot.radius * scale;
  const slotCenters = [x1, x2, x3];

  const outPad = model.outerPad;
  const bevel = model.rightBevelY;

  const flapGuideColor = '#adb6c2';
  const slotStrokeWidth = 1.6;

  const innerTopY = y0;
  const innerBottomY = y3;
  const innerLeftX = x0 - (slotHalf * 0.10);
  const innerRightX = x5 - (slotHalf * 0.10);
  const rightTopLegX = x4;
  const rightBottomLegX = x4;
  const rightInnerBevel = ((innerRightX - x4) / (x5 - x4)) * bevel;
  const innerStroke = `stroke:${flapGuideColor};stroke-width:${slotStrokeWidth};stroke-linejoin:round;stroke-linecap:round;fill:none`;

  const outerPath = [
    `M ${fmtNum(x0 - outPad)} ${fmtNum(y0 - outPad)}`,
    `L ${fmtNum(x4 + outPad)} ${fmtNum(y0 - outPad)}`,
    `L ${fmtNum(x4 + outPad)} ${fmtNum(y1 - bevel)}`,
    `L ${fmtNum(x5 + outPad)} ${fmtNum(y1)}`,
    `L ${fmtNum(x5 + outPad)} ${fmtNum(y2)}`,
    `L ${fmtNum(x4 + outPad)} ${fmtNum(y2 + bevel)}`,
    `L ${fmtNum(x4 + outPad)} ${fmtNum(y3 + outPad)}`,
    `L ${fmtNum(x0 - outPad)} ${fmtNum(y3 + outPad)}`,
    'Z'
  ].join(' ');

  const vbPad = 36;
  const vbXRaw = (x0 - outPad) - vbPad;
  const vbYRaw = (y0 - outPad) - vbPad;
  const vbWRaw = ((x5 + outPad) - (x0 - outPad)) + (vbPad * 2);
  const vbHRaw = ((y3 + outPad) - (y0 - outPad)) + (vbPad * 2);

  const dimFontSize = 42;
  const dimYOffset = dimFontSize * 0.62;
  const dimXOffset = dimFontSize * 0.55;
  const dimYL = y1 + ((y2 - y1) * 0.58);
  const dimYW = y1 + ((y2 - y1) * 0.76);
  const dimHX = x0 + ((x1 - x0) * 0.26);

  const innerTopSegments = [
    `<line x1='${fmtNum(innerLeftX)}' y1='${fmtNum(innerTopY)}' x2='${fmtNum(x1 - slotHalf)}' y2='${fmtNum(innerTopY)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(x1 + slotHalf)}' y1='${fmtNum(innerTopY)}' x2='${fmtNum(x2 - slotHalf)}' y2='${fmtNum(innerTopY)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(x2 + slotHalf)}' y1='${fmtNum(innerTopY)}' x2='${fmtNum(x3 - slotHalf)}' y2='${fmtNum(innerTopY)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(x3 + slotHalf)}' y1='${fmtNum(innerTopY)}' x2='${fmtNum(rightTopLegX)}' y2='${fmtNum(innerTopY)}' style='${innerStroke}'></line>`
  ].join('\n');
  
  const innerBottomSegments = [
    `<line x1='${fmtNum(innerLeftX)}' y1='${fmtNum(innerBottomY)}' x2='${fmtNum(x1 - slotHalf)}' y2='${fmtNum(innerBottomY)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(x1 + slotHalf)}' y1='${fmtNum(innerBottomY)}' x2='${fmtNum(x2 - slotHalf)}' y2='${fmtNum(innerBottomY)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(x2 + slotHalf)}' y1='${fmtNum(innerBottomY)}' x2='${fmtNum(x3 - slotHalf)}' y2='${fmtNum(innerBottomY)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(x3 + slotHalf)}' y1='${fmtNum(innerBottomY)}' x2='${fmtNum(rightBottomLegX)}' y2='${fmtNum(innerBottomY)}' style='${innerStroke}'></line>`
  ].join('\n');
  
  const innerSideAndRightTab = [
    `<line x1='${fmtNum(innerLeftX)}' y1='${fmtNum(innerTopY)}' x2='${fmtNum(innerLeftX)}' y2='${fmtNum(innerBottomY)}' style='${innerStroke}'></line>`,
  
    `<line x1='${fmtNum(rightTopLegX)}' y1='${fmtNum(innerTopY)}' x2='${fmtNum(rightTopLegX)}' y2='${fmtNum(y1)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(rightTopLegX)}' y1='${fmtNum(y1)}' x2='${fmtNum(innerRightX)}' y2='${fmtNum(y1 + rightInnerBevel)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(innerRightX)}' y1='${fmtNum(y1 + rightInnerBevel)}' x2='${fmtNum(innerRightX)}' y2='${fmtNum(y2 - rightInnerBevel)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(innerRightX)}' y1='${fmtNum(y2 - rightInnerBevel)}' x2='${fmtNum(rightBottomLegX)}' y2='${fmtNum(y2)}' style='${innerStroke}'></line>`,
    `<line x1='${fmtNum(rightBottomLegX)}' y1='${fmtNum(y2)}' x2='${fmtNum(rightBottomLegX)}' y2='${fmtNum(innerBottomY)}' style='${innerStroke}'></line>`
  ].join('\n');

  const flapGuides = '';

  const foldLines = [
    `<line class='pizza-fold' x1='${fmtNum(x0)}' y1='${fmtNum(y1)}' x2='${fmtNum(x4)}' y2='${fmtNum(y1)}'></line>`,
    `<line class='pizza-fold' x1='${fmtNum(x0)}' y1='${fmtNum(y2)}' x2='${fmtNum(x4)}' y2='${fmtNum(y2)}'></line>`,

    `<line class='pizza-fold' x1='${fmtNum(x1)}' y1='${fmtNum(y1)}' x2='${fmtNum(x1)}' y2='${fmtNum(y2)}'></line>`,
    `<line class='pizza-fold' x1='${fmtNum(x2)}' y1='${fmtNum(y1)}' x2='${fmtNum(x2)}' y2='${fmtNum(y2)}'></line>`,
    `<line class='pizza-fold' x1='${fmtNum(x3)}' y1='${fmtNum(y1)}' x2='${fmtNum(x3)}' y2='${fmtNum(y2)}'></line>`,

    `<line class='pizza-fold' x1='${fmtNum(x0)}' y1='${fmtNum(y1)}' x2='${fmtNum(x0)}' y2='${fmtNum(y2)}'></line>`,
    `<line class='pizza-fold' x1='${fmtNum(x4)}' y1='${fmtNum(y1)}' x2='${fmtNum(x4)}' y2='${fmtNum(y2)}'></line>`,

    `<line class='pizza-fold' x1='${fmtNum(x4)}' y1='${fmtNum(y1)}' x2='${fmtNum(x5)}' y2='${fmtNum(y1 + bevel)}'></line>`,
    `<line class='pizza-fold' x1='${fmtNum(x4)}' y1='${fmtNum(y2)}' x2='${fmtNum(x5)}' y2='${fmtNum(y2 - bevel)}'></line>`,
    `<line class='pizza-fold' x1='${fmtNum(x5)}' y1='${fmtNum(y1 + bevel)}' x2='${fmtNum(x5)}' y2='${fmtNum(y2 - bevel)}'></line>`
  ].join('\n');

  const slotCuts = slotCenters.map((cx) => {
    const topSlot = createRSCSlotPath(cx, y0, y1, slotHalf, slotRadius, 'top');
    const bottomSlot = createRSCSlotPath(cx, y3, y2, slotHalf, slotRadius, 'bottom');
  
    return [
      `<path d='${topSlot}' style='fill:none;stroke:${flapGuideColor};stroke-width:${slotStrokeWidth};stroke-linecap:round;stroke-linejoin:round'></path>`,
      `<path d='${bottomSlot}' style='fill:none;stroke:${flapGuideColor};stroke-width:${slotStrokeWidth};stroke-linecap:round;stroke-linejoin:round'></path>`
    ].join('\n');
  }).join('\n');

  const dimOverlay = `
    <line class='pizza-dim-guide' x1='${fmtNum(x0)}' y1='${fmtNum(y1)}' x2='${fmtNum(x0)}' y2='${fmtNum(y2)}'></line>
    <line class='pizza-dim-guide' x1='${fmtNum(x1)}' y1='${fmtNum(y1)}' x2='${fmtNum(x1)}' y2='${fmtNum(y2)}'></line>
    <line class='pizza-dim-guide' x1='${fmtNum(x2)}' y1='${fmtNum(y1)}' x2='${fmtNum(x2)}' y2='${fmtNum(y2)}'></line>

    <line class='pizza-dim-line' x1='${fmtNum(x1)}' y1='${fmtNum(dimYL)}' x2='${fmtNum(x2)}' y2='${fmtNum(dimYL)}'></line>
    <line class='pizza-dim-line' x1='${fmtNum(x0)}' y1='${fmtNum(dimYW)}' x2='${fmtNum(x1)}' y2='${fmtNum(dimYW)}'></line>
    <line class='pizza-dim-line' x1='${fmtNum(dimHX)}' y1='${fmtNum(y1)}' x2='${fmtNum(dimHX)}' y2='${fmtNum(y2)}'></line>

    <text class='pizza-dim-text' style='font-size:${fmtNum(dimFontSize)}px' x='${fmtNum((x1 + x2) / 2)}' y='${fmtNum(dimYL - dimYOffset)}' text-anchor='middle'>L=${Math.round(l)}mm</text>
    <text class='pizza-dim-text' style='font-size:${fmtNum(dimFontSize)}px' x='${fmtNum((x0 + x1) / 2)}' y='${fmtNum(dimYW - dimYOffset)}' text-anchor='middle'>W=${Math.round(w)}mm</text>
    <text class='pizza-dim-text' style='font-size:${fmtNum(dimFontSize)}px' x='${fmtNum(dimHX + dimXOffset)}' y='${fmtNum((y1 + y2) / 2)}' text-anchor='middle' transform='rotate(-90 ${fmtNum(dimHX + dimXOffset)} ${fmtNum((y1 + y2) / 2)})'>H=${Math.round(h)}mm</text>
  `;

  return {
    html: `
      <div class='pizza-svg-stage'>
        <div class='pizza-svg-canvas'>
          <svg class='pizza-svg-plot' viewBox='${fmtNum(vbXRaw)} ${fmtNum(vbYRaw)} ${fmtNum(vbWRaw)} ${fmtNum(vbHRaw)}' role='img' aria-label='RSC Box die line'>
            <defs>
              <marker id='pizzaArrow' viewBox='0 0 10 10' refX='5' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>
                <path d='M0,0 L10,5 L0,10 z' fill='#2f6dff'></path>
              </marker>
            </defs>

            <path class='pizza-cut' d='${outerPath}'></path>
            ${innerTopSegments}
            ${innerBottomSegments}
            ${innerSideAndRightTab}
            ${flapGuides}
            ${foldLines}
            ${slotCuts}
            ${dimOverlay}
          </svg>
        </div>
        <div class='pizza-svg-caption'>
          RSC dieline (from your Detail SVG architecture): L ${Math.round(l)} x W ${Math.round(w)} x H ${Math.round(h)} mm
        </div>
      </div>
    `,
    dims: { L: l, W: w, H: h }
  };
}

async function createGiftTemplateSVG(L, W, H) {
  const resolved = resolveGiftInput(L, W, H);
  const l = resolved.L;
  const w = resolved.W;
  const h = resolved.H;

  const template = await loadGiftReferenceTemplate();
  const ref = GIFT_REFERENCE_TEMPLATE;
  const axes = buildGiftTargetAxes(l, w, h);

  const mapX = (x) => mapAxisPiecewise(x, ref.baseX, axes.targetX);
  const mapY = (y) => mapAxisPiecewise(y, ref.baseY, axes.targetY);

  const lineSvg = template.lineElements.map((line) => {
    const cls = classifyGiftLine(line);
    return `<line class="${cls}" x1="${fmtNum(mapX(line.x1))}" y1="${fmtNum(mapY(line.y1))}" x2="${fmtNum(mapX(line.x2))}" y2="${fmtNum(mapY(line.y2))}"></line>`;
  }).join("\n");

  const pathSvg = template.pathElements.map((pathItem) => {
    const cls = classifyGiftPath(pathItem);
    const td = transformPathData(pathItem.d, mapX, mapY);
    return `<path class="${cls}" d="${td}"></path>`;
  }).join("\n");

  const dimOverlay = buildGiftDimOverlay(axes, l, w, h);

  const allX = [
    mapX(ref.viewBox.x),
    mapX(ref.viewBox.x + ref.viewBox.width)
  ];
  const allY = [
    mapY(ref.viewBox.y),
    mapY(ref.viewBox.y + ref.viewBox.height)
  ];

  const vbPad = 28;
  const vbXRaw = Math.min(...allX) - vbPad;
  const vbYRaw = Math.min(...allY) - vbPad;
  const vbWRaw = Math.abs(allX[1] - allX[0]) + (vbPad * 2);
  const vbHRaw = Math.abs(allY[1] - allY[0]) + (vbPad * 2);

  return {
    html: `
      <div class="pizza-svg-stage">
        <div class="pizza-svg-canvas">
          <svg class="pizza-svg-plot" viewBox="${fmtNum(vbXRaw)} ${fmtNum(vbYRaw)} ${fmtNum(vbWRaw)} ${fmtNum(vbHRaw)}" role="img" aria-label="Gift Box die line">
            <defs>
              <marker id="pizzaArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#2f6dff"></path>
              </marker>
            </defs>

            <style>
              .gift-inner {
                fill: none;
                stroke: #adb6c2;
                stroke-width: 1.6;
                stroke-linejoin: round;
                stroke-linecap: round;
              }
            </style>

            ${lineSvg}
            ${pathSvg}
            ${dimOverlay}
          </svg>
        </div>
        <div class="pizza-svg-caption">
          Gift Box dieline (rebuilt from your 4 clean SVG references): L ${Math.round(l)} x W ${Math.round(w)} x H ${Math.round(h)} mm
        </div>
      </div>
    `,
    dims: { L: l, W: w, H: h }
  };
}

async function createFivePanelTemplateSVG(L, W, H) {
  // 2026-07-02 修正：默认值和范围之前跟错误的 refDims 是同一套错位（L/W/H 循环错位），
  // 现在跟 FIVE_PANEL_REFERENCE_TEMPLATE.refDims 修正后的角色对齐。
  const l = clamp(valueOrDefault(L, 200), 30, 600);
  const w = clamp(valueOrDefault(W, 150), 30, 500);
  const h = clamp(valueOrDefault(H, 50), 20, 300);

  const template = await loadFivePanelReferenceTemplate();
  const ref = FIVE_PANEL_REFERENCE_TEMPLATE;
  const axes = buildFivePanelTargetAxes(l, w, h);

  const mapX = (x) => mapAxisPiecewise(x, ref.baseX, axes.targetX);
  const mapY = (y) => mapAxisPiecewise(y, ref.baseY, axes.targetY);

  const lineSvg = template.lineElements.map((line) => {
    const cls = classifyFivePanelLine(line);
    return `<line class="${cls}" x1="${fmtNum(mapX(line.x1))}" y1="${fmtNum(mapY(line.y1))}" x2="${fmtNum(mapX(line.x2))}" y2="${fmtNum(mapY(line.y2))}"></line>`;
  }).join("\n");

  const pathSvg = template.pathElements.map((pathItem) => {
    const cls = classifyFivePanelPath(pathItem);
    const td = transformPathData(pathItem.d, mapX, mapY);
    return `<path class="${cls}" d="${td}"></path>`;
  }).join("\n");

  const dimOverlay = buildFivePanelDimOverlay(axes, l, w, h);

  const allX = [
    mapX(ref.viewBox.x),
    mapX(ref.viewBox.x + ref.viewBox.width)
  ];
  const allY = [
    mapY(ref.viewBox.y),
    mapY(ref.viewBox.y + ref.viewBox.height)
  ];

  const vbPad = 28;
  const vbXRaw = Math.min(...allX) - vbPad;
  const vbYRaw = Math.min(...allY) - vbPad;
  const vbWRaw = Math.abs(allX[1] - allX[0]) + (vbPad * 2);
  const vbHRaw = Math.abs(allY[1] - allY[0]) + (vbPad * 2);

  return {
    html: `
      <div class="pizza-svg-stage">
        <div class="pizza-svg-canvas">
          <svg class="pizza-svg-plot" viewBox="${fmtNum(vbXRaw)} ${fmtNum(vbYRaw)} ${fmtNum(vbWRaw)} ${fmtNum(vbHRaw)}" role="img" aria-label="5 Panel Box die line">
            <defs>
              <marker id="pizzaArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#2f6dff"></path>
              </marker>
            </defs>

            <style>
              .five-inner {
                fill: rgba(255, 255, 255, 0.28);
                stroke: #7fc463;
                stroke-width: 1.8;
                stroke-linecap: round;
                stroke-linejoin: round;
              }
              .five-fold {
                fill: none;
                stroke: #d74c4c;
                stroke-width: 1.5;
                stroke-linecap: round;
                stroke-linejoin: round;
              }
            </style>

            ${lineSvg}
            ${pathSvg}
            ${dimOverlay}
          </svg>
        </div>
        <div class="pizza-svg-caption">
          5 Panel Box dieline (from your provided SVG template): L${Math.round(l)} x W${Math.round(w)} x D${Math.round(h)} mm
        </div>
      </div>
    `,
    dims: { L: l, W: w, H: h }
  };
}

function getPreviewSvgState(svg) {
  if (svg.__previewState) {
    return svg.__previewState;
  }

  const vb = svg.viewBox.baseVal;
  const baseViewBox = {
    x: vb.x,
    y: vb.y,
    width: vb.width,
    height: vb.height
  };

  const dimTexts = Array.from(svg.querySelectorAll('.pizza-dim-text')).map((el) => ({
    el,
    baseFontSize: parseFloat(el.style.fontSize) || parseFloat(window.getComputedStyle(el).fontSize) || 42,
    baseStrokeWidth: parseFloat(window.getComputedStyle(el).strokeWidth) || 4
  }));

  const state = {
    baseViewBox,
    currentViewBox: { ...baseViewBox },
    minZoom: 1,
    maxZoom: 8,
    dimTexts
  };

  svg.__previewState = state;
  return state;
}

function clampPreviewViewBox(next, base, maxZoom) {
  const minWidth = base.width / maxZoom;
  const minHeight = base.height / maxZoom;

  const width = clamp(next.width, minWidth, base.width);
  const height = clamp(next.height, minHeight, base.height);

  const maxX = base.x + base.width - width;
  const maxY = base.y + base.height - height;

  const x = clamp(next.x, base.x, maxX);
  const y = clamp(next.y, base.y, maxY);

  return { x, y, width, height };
}

function applyPreviewViewBox(svg, nextViewBox) {
  const state = getPreviewSvgState(svg);
  const base = state.baseViewBox;
  const clamped = clampPreviewViewBox(nextViewBox, base, state.maxZoom);

  state.currentViewBox = clamped;

  svg.setAttribute(
    'viewBox',
    `${fmtNum(clamped.x)} ${fmtNum(clamped.y)} ${fmtNum(clamped.width)} ${fmtNum(clamped.height)}`
  );

  const zoom = base.width / clamped.width;

  state.dimTexts.forEach((item) => {
    item.el.style.fontSize = `${item.baseFontSize / zoom}px`;
    item.el.style.strokeWidth = `${item.baseStrokeWidth / zoom}px`;
  });
}

function initPreviewPanZoom(stage) {
  const canvas = stage.querySelector('.pizza-svg-canvas');
  const svg = stage.querySelector('.pizza-svg-plot');

  if (!canvas || !svg) {
    return;
  }

  const state = getPreviewSvgState(svg);
  applyPreviewViewBox(svg, state.baseViewBox);

  let dragging = false;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragStartViewBox = null;

  const onWheel = (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    const current = state.currentViewBox;
    const zoomFactor = e.deltaY < 0 ? 1 / 1.12 : 1.12;

    const nextWidth = current.width * zoomFactor;
    const nextHeight = current.height * zoomFactor;

    const anchorX = current.x + (current.width * px);
    const anchorY = current.y + (current.height * py);

    const nextX = anchorX - (nextWidth * px);
    const nextY = anchorY - (nextHeight * py);

    applyPreviewViewBox(svg, {
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight
    });
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) {
      return;
    }

    e.preventDefault();
    dragging = true;
    canvas.classList.add('is-dragging');

    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    dragStartViewBox = { ...state.currentViewBox };
  };

  const onMouseMove = (e) => {
    if (!dragging || !dragStartViewBox) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const dxPx = e.clientX - dragStartClientX;
    const dyPx = e.clientY - dragStartClientY;

    const dxSvg = (dxPx / rect.width) * dragStartViewBox.width;
    const dySvg = (dyPx / rect.height) * dragStartViewBox.height;

    applyPreviewViewBox(svg, {
      x: dragStartViewBox.x - dxSvg,
      y: dragStartViewBox.y - dySvg,
      width: dragStartViewBox.width,
      height: dragStartViewBox.height
    });
  };

  const stopDragging = () => {
    dragging = false;
    dragStartViewBox = null;
    canvas.classList.remove('is-dragging');
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', stopDragging);
  canvas.addEventListener('mouseleave', stopDragging);
}

async function render2DPreview() {
  const stage = document.getElementById("previewStage");
  if (!stage) {
    return;
  }

  const defaults = getBoxDefaultDimensions(selectedBox);
  const L = parseFloat(document.getElementById("length").value) || defaults.L || 0;
  const W = parseFloat(document.getElementById("width").value) || defaults.W || 0;
  const H = parseFloat(document.getElementById("height").value) || defaults.H || 0;

  if (!selectedBox) {
    stage.innerHTML = '<div class="preview-placeholder">Select a box type to start preview.</div>';
    updateDimensionChips(0, 0, 0);
    return;
  }

  if (selectedBox === "Pizza Box") {
    const pizza = createPizzaTemplateBSVG(L, W, H);
    stage.innerHTML = pizza.html;
    initPreviewPanZoom(stage);
    updateDimensionChips(pizza.dims.L, pizza.dims.W, pizza.dims.D);
    return;
  }

  if (selectedBox === "RSC Box") {
    const rsc = createRSCTemplateSVG(L, W, H);
    stage.innerHTML = rsc.html;
    initPreviewPanZoom(stage);
    updateDimensionChips(rsc.dims.L, rsc.dims.W, rsc.dims.H);
    return;
  }

  if (selectedBox === "Gift Box") {
    const requestedBox = selectedBox;
    stage.innerHTML = '<div class="preview-placeholder">Loading Gift Box SVG template...</div>';
  
    try {
      const gift = await createGiftTemplateSVG(L, W, H);
  
      if (selectedBox !== requestedBox) {
        return;
      }
  
      stage.innerHTML = gift.html;
      initPreviewPanZoom(stage);
      updateDimensionChips(gift.dims.L, gift.dims.W, gift.dims.H);
    } catch (err) {
      stage.innerHTML = '<div class="preview-placeholder">Failed to load Gift Box SVG template.</div>';
      console.error(err);
      updateDimensionChips(L, W, H);
    }
    return;
  }

  if (selectedBox === "5 Panel Box") {
    const requestedBox = selectedBox;
    stage.innerHTML = '<div class="preview-placeholder">Loading 5 Panel Box SVG template...</div>';
  
    try {
      const fivePanel = await createFivePanelTemplateSVG(L, W, H);
  
      if (selectedBox !== requestedBox) {
        return;
      }
  
      stage.innerHTML = fivePanel.html;
      initPreviewPanZoom(stage);
      updateDimensionChips(fivePanel.dims.L, fivePanel.dims.W, fivePanel.dims.H);
    } catch (err) {
      stage.innerHTML = '<div class="preview-placeholder">Failed to load 5 Panel Box SVG template.</div>';
      console.error(err);
      updateDimensionChips(L, W, H);
    }
    return;
  }

  stage.innerHTML = `
    <div class="preview-static">
      <img src="${selectedBoxImage}" alt="${selectedBox} reference preview">
      <div>Live 2D dimension drawing is currently enabled for Pizza Box and RSC Box first.</div>
    </div>
  `;

  updateDimensionChips(L, W, H);
}

["length", "width", "height", "qty"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderActivePreview);
});

document.getElementById("previewMode2D").addEventListener("click", () => {
  switchPreviewMode("2d");
});

document.getElementById("previewMode3D").addEventListener("click", () => {
  if (selectedBox !== "RSC Box" && selectedBox !== "5 Panel Box" && selectedBox !== "Pizza Box" && selectedBox !== "Gift Box") {
    return;
  }
  switchPreviewMode("3d");
});

syncPreviewModeButtons();
syncPreviewPanelHeading();
applyPreviewModeVisibility();
renderActivePreview();

window.selectBox = selectBox;
window.goBack = goBack;
window.selectLayer = selectLayer;
window.calculatePrice = calculatePrice;
window.updateBoxPreview = renderActivePreview;
window.switchPreviewMode = switchPreviewMode;









