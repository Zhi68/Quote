(function () {
  // ════════════════════════════════════════════════════════════════
  // RSC 纸箱（Regular Slotted Container）展开图 3D 折叠预览模型
  //
  // 坐标系说明：
  //   X 轴 = 展开图的长度方向，各面板从左到右依次排列：
  //          LEFT SIDE → FRONT → RIGHT SIDE → BACK → TAB(粘合舌)
  //   Z 轴 = 展开图的高度方向，对应"上边(顶盖区)→主体→下边(底盖区)"
  //   Y 轴 = 仅用于把不同类型的线在渲染层级上略微错开，避免 z-fighting，
  //          不代表真实高度（面板本身永远在 Y_PANEL=0 这个平面上）
  //
  // 颜色图例：
  //   PANEL_COLOR = 面板本色（浅棕色，实心网格）
  //   EDGE_COLOR  = 面板中性分隔框（灰色，仅作视觉分区，不代表刀线/折线）
  //   FOLD_COLOR  = 折叠线（红色，实际装箱时对折的位置）
  //   CUT_COLOR   = 切割线（绿色，实际模切/裁切的位置）
  //
  // 折叠动画原理：
  //   每个需要独立折叠的面板都套一个 pivot（THREE.Group），
  //   面板本体和它自己的切割线都作为这个 pivot 的子节点。
  //   rsc-3d-player.js 通过修改各 pivot 的 rotation 实现分阶段折叠动画。
  //   不需要折叠的面板（比如 topMainBack/botMainBack）没有独立 pivot，
  //   直接挂在父级 group 上，跟随父级一起刚性运动。
  // ════════════════════════════════════════════════════════════════

  const PANEL_COLOR = 0xbe9871;
  const EDGE_COLOR  = 0x996633;
  const FOLD_COLOR  = 0xd74c4c;
  const CUT_COLOR   = 0x4cb36c;

  // 渲染层高度（避免共面线条 z-fighting，从低到高：面板 < 灰边 < 红折线 < 绿切线）
  const Y_PANEL = 0;
  const Y_EDGE  = 0.3;
  const Y_FOLD  = 0.8;
  const Y_CUT   = 1.2;

  // 生成一个矩形平面网格（面板本体），默认铺在 XZ 平面上
  function makeFlatPanel(width, depth) {
    const geo = new THREE.PlaneGeometry(width, depth);
    const mat = new THREE.MeshLambertMaterial({ color: PANEL_COLOR, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  // 生成一个闭合矩形轮廓线（4条边首尾相连），用于面板的灰色分区框
  function makeRect(xA, zA, xB, zB, color, y) {
    const pts = [
      new THREE.Vector3(xA, y, zA), new THREE.Vector3(xB, y, zA),
      new THREE.Vector3(xB, y, zB), new THREE.Vector3(xA, y, zB),
      new THREE.Vector3(xA, y, zA),
    ];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color }));
  }

  // 生成一条两点直线段，用于单独的一条折叠线/切割线
  function makeSeg(xA, zA, xB, zB, color, y) {
    const pts = [new THREE.Vector3(xA, y, zA), new THREE.Vector3(xB, y, zB)];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color }));
  }

  // 生成任意多点折线（不自动闭合，传入的点是几个就画几段），
  // 用于形状不规则的切割线轮廓（比如带缺口的防尘襟片、tab 斜切角）
  function makeLine(pts, color) {
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color }));
  }

  function buildRSC3DModel(dimensions) {
    // L/W/H 是用户输入的成品内径尺寸（长/宽/高），单位 mm
    const L = Math.max(1, Number(dimensions.L) || 300);
    const W = Math.max(1, Number(dimensions.W) || 100);
    const H = Math.max(1, Number(dimensions.H) || 100);

    const root = new THREE.Group();

    // die* 系列是"模切尺寸"，即在成品尺寸基础上加上工艺预留量（纸厚补偿等）
    const dieL = L + 4;
    const dieW = W + 4;
    const dieH = H + 8.3;
    // flapH  = 防尘襟片（top/bot dust flap）的高度，取箱宽一半再加一点重叠量
    const flapH  = dieW * 0.5 + 1;
    // bevelMm = 粘合舌(glue tab)两端斜切角的深度，原始单位是 29pt，这里换算成 mm
    const bevelMm = 29 / (72 / 25.4);
    // tabW = 粘合舌的宽度，按箱高的比例计算，并限制在 [36.7, 41.7] 区间内
    const tabW   = Math.min(Math.max(dieH * 0.14, 36.7), 41.7);

    // 展开图沿 X 方向的总宽度 = LEFT SIDE + FRONT + RIGHT SIDE + BACK + TAB
    const totalX = dieW + dieL + dieW + dieL + tabW;
    // x0/x1/x2 是主体四块面板在 X 轴上的分界点（展开图以中心为原点左右对称摆放）
    // x0 = LEFT SIDE 左边界，x1 = LEFT SIDE/FRONT 分界（同时是 leftSidePivot 位置），
    // x2 = FRONT/RIGHT SIDE 分界（同时是 rightGroupPivot 位置）
    const x0 = -totalX / 2;
    const x1 = x0 + dieW;
    const x2 = x1 + dieL;

    // zBT/zBB = 主体面板的上/下边界（Box Top / Box Bottom）
    // zFT/zFB = 算上顶盖/底盖襟片之后展开图的最外侧上/下边界（Flap Top / Flap Bottom）
    const zBT = -dieH / 2;
    const zBB = +dieH / 2;
    const zFT = zBT - flapH;
    const zFB = zBB + flapH;

    // FRONT 面板的中心 X 坐标
    const cxFR = (x1 + x2) / 2;

    // ── FRONT PANEL（固定参照面，不套任何 pivot，直接挂 root，
    // 永远不转，是这次改了基底之后唯一"哪里都不用去"的面板）──────
    const frontMesh = makeFlatPanel(dieL, dieH);
    frontMesh.position.set(cxFR, Y_PANEL, 0);
    root.add(frontMesh);
    root.add(makeRect(x1, zBT, x2, zBB, EDGE_COLOR, Y_EDGE));
    const front = frontMesh;

    // top main FRONT（顶盖-正面主翼片，独立 pivot，直接挂 root——
    // 因为 FRONT 自己不转，这个 pivot 的锚点直接用它自己的真实世界坐标即可）
    const topMainFrontPivot = new THREE.Group();
    topMainFrontPivot.position.set(cxFR, 0, zBT);
    root.add(topMainFrontPivot);
    const topMainFrontMesh = makeFlatPanel(dieL, flapH);
    topMainFrontMesh.position.set(0, 0, -flapH / 2);
    topMainFrontPivot.add(topMainFrontMesh);
    topMainFrontPivot.add(makeLine([
      new THREE.Vector3(-dieL/2, Y_CUT, -flapH),
      new THREE.Vector3( dieL/2, Y_CUT, -flapH),
    ], CUT_COLOR));
    const topMainFront = topMainFrontMesh;

    // bot main FRONT（底盖-正面主翼片，逻辑同上）
    const botMainFrontPivot = new THREE.Group();
    botMainFrontPivot.position.set(cxFR, 0, zBB);
    root.add(botMainFrontPivot);
    const botMainFrontMesh = makeFlatPanel(dieL, flapH);
    botMainFrontMesh.position.set(0, 0, flapH / 2);
    botMainFrontPivot.add(botMainFrontMesh);
    botMainFrontPivot.add(makeLine([
      new THREE.Vector3(-dieL/2, Y_CUT, flapH),
      new THREE.Vector3( dieL/2, Y_CUT, flapH),
    ], CUT_COLOR));
    const botMainFront = botMainFrontMesh;

    // ── LEFT SIDE（独立 pivot，锚点在 x1，即 LEFT SIDE｜FRONT 折叠缝，
    // 这次改动之后不再嵌套在别的 pivot 里，自己就是 root 的直接子节点）──
    const leftSidePivot = new THREE.Group();
    leftSidePivot.position.set(x1, 0, 0);
    root.add(leftSidePivot);

    const leftSideMesh = makeFlatPanel(dieW, dieH);
    leftSideMesh.position.set(-dieW / 2, Y_PANEL, 0);
    leftSidePivot.add(leftSideMesh);
    leftSidePivot.add(makeRect(-dieW, zBT, 0, zBB, EDGE_COLOR, Y_EDGE));
    leftSidePivot.add(makeSeg(-dieW, zBT, -dieW, zBB, CUT_COLOR, Y_CUT));
    leftSidePivot.add(makeSeg(-dieW, zBT, 0, zBT, FOLD_COLOR, Y_FOLD));
    leftSidePivot.add(makeSeg(-dieW, zBB, 0, zBB, FOLD_COLOR, Y_FOLD));
    const leftSide = leftSideMesh;

    const topDustLeftPivot = new THREE.Group();
    topDustLeftPivot.position.set(-dieW / 2, 0, zBT);
    leftSidePivot.add(topDustLeftPivot);
    const topDustLeftMesh = makeFlatPanel(dieW, flapH);
    topDustLeftMesh.position.set(0, 0, -flapH / 2);
    topDustLeftPivot.add(topDustLeftMesh);
    topDustLeftPivot.add(makeLine([
      new THREE.Vector3(-dieW/2, Y_CUT, 0),
      new THREE.Vector3(-dieW/2, Y_CUT, -flapH),
      new THREE.Vector3(dieW/2, Y_CUT, -flapH),
      new THREE.Vector3(dieW/2, Y_CUT, 0),
    ], CUT_COLOR));
    const topDustLeft = topDustLeftMesh;

    const botDustLeftPivot = new THREE.Group();
    botDustLeftPivot.position.set(-dieW / 2, 0, zBB);
    leftSidePivot.add(botDustLeftPivot);
    const botDustLeftMesh = makeFlatPanel(dieW, flapH);
    botDustLeftMesh.position.set(0, 0, flapH / 2);
    botDustLeftPivot.add(botDustLeftMesh);
    botDustLeftPivot.add(makeLine([
      new THREE.Vector3(dieW/2, Y_CUT, 0),
      new THREE.Vector3(dieW/2, Y_CUT, flapH),
      new THREE.Vector3(-dieW/2, Y_CUT, flapH),
      new THREE.Vector3(-dieW/2, Y_CUT, 0),
    ], CUT_COLOR));
    const botDustLeft = botDustLeftMesh;

    // ── RIGHT GROUP（独立 pivot，锚点在 x2）──────────────────────
    // 只包含 RIGHT SIDE 本体 + 左右两个防尘襟片，Phase 5 时整体绕 x2 站立
    const rightGroupPivot = new THREE.Group();
    rightGroupPivot.position.set(x2, 0, 0);
    root.add(rightGroupPivot);

    const lx3 = dieW; // RIGHT SIDE / BACK 分界，同时是 backGroupPivot 的锚点

    // RIGHT SIDE（局部 x: 0 ~ lx3，不单独折叠，只随 rightGroupPivot 站立）
    const rightSideMesh = makeFlatPanel(dieW, dieH);
    rightSideMesh.position.set(dieW / 2, Y_PANEL, 0);
    rightGroupPivot.add(rightSideMesh);
    rightGroupPivot.add(makeRect(0, zBT, lx3, zBB, EDGE_COLOR, Y_EDGE));
    const rightSide = rightSideMesh;

    // top dust RIGHT（顶盖-右侧防尘襟片，独立 pivot）
    const topDustRightPivot = new THREE.Group();
    topDustRightPivot.position.set(dieW / 2, 0, zBT);
    rightGroupPivot.add(topDustRightPivot);
    const topDustRightMesh = makeFlatPanel(dieW, flapH);
    topDustRightMesh.position.set(0, 0, -flapH / 2);
    topDustRightPivot.add(topDustRightMesh);
    // 左/上/右三边，下边(z=0)是折叠缝，画在别处（红色），不重复
    topDustRightPivot.add(makeLine([
      new THREE.Vector3(-dieW/2, Y_CUT, 0),
      new THREE.Vector3(-dieW/2, Y_CUT, -flapH),
      new THREE.Vector3( dieW/2, Y_CUT, -flapH),
      new THREE.Vector3( dieW/2, Y_CUT,  0),
    ], CUT_COLOR));
    const topDustRight = topDustRightMesh;

    // bot dust RIGHT（底盖-右侧防尘襟片，逻辑同上，方向镜像）
    const botDustRightPivot = new THREE.Group();
    botDustRightPivot.position.set(dieW / 2, 0, zBB);
    rightGroupPivot.add(botDustRightPivot);
    const botDustRightMesh = makeFlatPanel(dieW, flapH);
    botDustRightMesh.position.set(0, 0, flapH / 2);
    botDustRightPivot.add(botDustRightMesh);
    botDustRightPivot.add(makeLine([
      new THREE.Vector3( dieW/2, Y_CUT,  0),
      new THREE.Vector3( dieW/2, Y_CUT,  flapH),
      new THREE.Vector3(-dieW/2, Y_CUT,  flapH),
      new THREE.Vector3(-dieW/2, Y_CUT,  0),
    ], CUT_COLOR));
    const botDustRight = botDustRightMesh;

    // RIGHT SIDE 自己这一段的折叠线（红色），只画到 lx3 为止，
    // lx3 往右（BACK 那一段）改由 backGroupPivot 自己画
    rightGroupPivot.add(makeSeg(0, zBT, lx3, zBT, FOLD_COLOR, Y_FOLD));
    rightGroupPivot.add(makeSeg(0, zBB, lx3, zBB, FOLD_COLOR, Y_FOLD));
    // RIGHT SIDE｜BACK 折叠缝：正好是 backGroupPivot 的旋转轴，
    // 画在轴线上不受旋转影响，留在这不用跟着搬家
    rightGroupPivot.add(makeSeg(lx3, zBT, lx3, zBB, FOLD_COLOR, Y_FOLD));

    // ── BACK GROUP（独立 pivot，锚点在 lx3，即 RIGHT SIDE｜BACK 折叠缝）──
    // 包含：BACK 本体 + 顶/底 main 翼片 + TAB。
    // Phase 6：topMainBack / botMainBack / TAB 各自往 BACK 方向折叠
    // Phase 7：这一整组绕 lx3 轴、朝 RIGHT SIDE 方向转 90°，闭合箱体
    const backGroupPivot = new THREE.Group();
    backGroupPivot.position.set(lx3, 0, 0);
    rightGroupPivot.add(backGroupPivot);

    // BACK（backGroupPivot 内部，局部 x: 0 ~ dieL）
    const backMesh = makeFlatPanel(dieL, dieH);
    backMesh.position.set(dieL / 2, Y_PANEL, 0);
    backGroupPivot.add(backMesh);
    backGroupPivot.add(makeRect(0, zBT, dieL, zBB, EDGE_COLOR, Y_EDGE));
    const back = backMesh;

    // top main BACK（顶盖-背面主翼片，独立 pivot，挂在 backGroupPivot 内部）
    const topMainBackPivot = new THREE.Group();
    topMainBackPivot.position.set(dieL / 2, 0, zBT);
    backGroupPivot.add(topMainBackPivot);
    const topMainBackMesh = makeFlatPanel(dieL, flapH);
    topMainBackMesh.position.set(0, 0, -flapH / 2);
    topMainBackPivot.add(topMainBackMesh);
    // 只画右边+上边：左边跟 topDustRight 的右边完全重合，那边已经画过，不重复；
    // 下边(z=0)是折叠缝，画在 backGroupPivot 里
    topMainBackPivot.add(makeLine([
      new THREE.Vector3(dieL/2, Y_CUT, 0),
      new THREE.Vector3(dieL/2, Y_CUT, -flapH),
      new THREE.Vector3(-dieL/2, Y_CUT, -flapH),
    ], CUT_COLOR));
    const topMainBack = topMainBackMesh;

    // bot main BACK（底盖-背面主翼片，逻辑同上，方向镜像）
    const botMainBackPivot = new THREE.Group();
    botMainBackPivot.position.set(dieL / 2, 0, zBB);
    backGroupPivot.add(botMainBackPivot);
    const botMainBackMesh = makeFlatPanel(dieL, flapH);
    botMainBackMesh.position.set(0, 0, flapH / 2);
    botMainBackPivot.add(botMainBackMesh);
    botMainBackPivot.add(makeLine([
      new THREE.Vector3(dieL/2, Y_CUT, 0),
      new THREE.Vector3(dieL/2, Y_CUT, flapH),
      new THREE.Vector3(-dieL/2, Y_CUT, flapH),
    ], CUT_COLOR));
    const botMainBack = botMainBackMesh;

    // TAB 粘合舌（独立 pivot，挂在 backGroupPivot 内部，锚点在 dieL，即 BACK｜TAB 折叠缝）
    const tabPivot = new THREE.Group();
    tabPivot.position.set(dieL, 0, 0);
    backGroupPivot.add(tabPivot);

    // 梯形几何体，坐标已改成相对 tabPivot 的局部坐标（0 ~ tabW）
    const tabVerts = new Float32Array([
      0,    Y_PANEL, zBT,
      tabW, Y_PANEL, zBT + bevelMm,
      tabW, Y_PANEL, zBB - bevelMm,
      0,    Y_PANEL, zBB,
    ]);
    const tabIdx = new Uint16Array([0, 1, 3,  1, 2, 3]);
    const tabGeo = new THREE.BufferGeometry();
    tabGeo.setAttribute('position', new THREE.BufferAttribute(tabVerts, 3));
    tabGeo.setIndex(new THREE.BufferAttribute(tabIdx, 1));
    tabGeo.computeVertexNormals();
    const glueTab = new THREE.Mesh(tabGeo,
      new THREE.MeshLambertMaterial({ color: PANEL_COLOR, side: THREE.DoubleSide }));
    tabPivot.add(glueTab);

    // TAB 斜切角三条裁切边（局部坐标，绿色）
    tabPivot.add(makeSeg(0,    zBT,           tabW, zBT + bevelMm, CUT_COLOR, Y_CUT));
    tabPivot.add(makeSeg(tabW, zBT + bevelMm, tabW, zBB - bevelMm, CUT_COLOR, Y_CUT));
    tabPivot.add(makeSeg(tabW, zBB - bevelMm, 0,    zBB,           CUT_COLOR, Y_CUT));

    // BACK 自己这一段的折叠线（红色），只画 0~dieL；
    // BACK｜TAB 分界正好是 tabPivot 的旋转轴，画在 backGroupPivot 里，
    // 不受 tabPivot 自转影响，但会随 backGroupPivot 整体转动（这正是要的效果）
    backGroupPivot.add(makeSeg(0, zBT, dieL, zBT, FOLD_COLOR, Y_FOLD));
    backGroupPivot.add(makeSeg(0, zBB, dieL, zBB, FOLD_COLOR, Y_FOLD));
    backGroupPivot.add(makeSeg(dieL, zBT, dieL, zBB, FOLD_COLOR, Y_FOLD));

    // ── 挂在 root 上的静态折叠线（LEFT SIDE｜FRONT、FRONT｜RIGHT SIDE
    // 两条分界线）：这两条正好都落在各自转动组的转轴上，FRONT 自己
    // 全程不转，两条线不管旁边怎么转都不需要跟着动，留在 root 里画一次就够
    root.add(makeSeg(x1, zBT, x1, zBB, FOLD_COLOR, Y_FOLD));
    root.add(makeSeg(x2, zBT, x2, zBB, FOLD_COLOR, Y_FOLD));

    // 展开图整体尺寸 + FRONT PANEL 的世界坐标中心，给 3D 场景摆镜头用
    // （FRONT 是箱子的主视觉面，镜头默认对准它，而不是整条展开图的
    // 几何中心——那个中心点其实落在 RIGHT SIDE 附近，不是 FRONT）
    const flatWidth = totalX;
    const flatDepth = 2 * flapH + dieH;
    const focusX = x2 - dieL / 2;

    // parts 里导出的各个 pivot/mesh 会被 rsc-3d-player.js 引用，
    // 用来在折叠动画的不同 Phase 里设置对应 pivot 的 rotation
    return {
      root,
      dimensions: { L, W, H },
      flatWidth,
      flatDepth,
      focusX,
      parts: {
        leftSidePivot,     leftSide,
        front,
        rightGroupPivot,   rightSide,
        topDustLeftPivot,  topDustLeft,
        topMainFrontPivot, topMainFront,
        topDustRightPivot, topDustRight,
        botDustLeftPivot,  botDustLeft,
        botMainFrontPivot, botMainFront,
        botDustRightPivot, botDustRight,
        backGroupPivot,    back,
        topMainBackPivot,  topMainBack,
        botMainBackPivot,  botMainBack,
        tabPivot,          glueTab
      }
    };
  }

  window.RSC3DModel = { buildRSC3DModel };
})();