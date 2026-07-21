(function () {
  // ════════════════════════════════════════════════════════════════
  // 5 Panel Box 展开图 3D 模型 + 折叠 pivot 层级
  //
  // 折叠顺序（6 步，跟 rsc-3d-model.js 的风格一致）：
  //   Phase 1: SIDE2-TOP/BOTTOM 折向 SIDE2；TAB-TOP/BOTTOM 折向 TAB
  //   Phase 2: SIDE1+FRONT+SIDE2 整条（leftChainPivot）转向 BACK；
  //            TAB 整体（tabPivot）转向 BACK。BACK 全程不转，是固定参照面
  //   Phase 3: BACK-TOP/BOTTOM 折向 BACK
  //   Phase 4: SIDE1-TOP/BOTTOM 折向 SIDE1；FRONT-TOP/BOTTOM 折向 FRONT
  //   Phase 5: FRONT 带着 SIDE1（frontChainPivot）转向 SIDE2
  //   Phase 6: SIDE1（side1Pivot）再单独转向 FRONT，扣进预留的小孔，完成
  //
  // pivot 嵌套关系：
  //   root
  //   ├── BACK（静态网格）+ backTopPivot / backBottomPivot
  //   ├── tabPivot（锚点：TAB｜BACK 接缝）
  //   │     └── TAB + tabTopPivot / tabBottomPivot
  //   └── leftChainPivot（锚点：SIDE2｜BACK 接缝）
  //         ├── SIDE2 + side2TopPivot / side2BottomPivot
  //         └── frontChainPivot（锚点：FRONT｜SIDE2 接缝，嵌在 leftChainPivot 里）
  //               ├── FRONT + frontTopPivot / frontBottomPivot
  //               └── side1Pivot（锚点：SIDE1｜FRONT 接缝，嵌在 frontChainPivot 里）
  //                     └── SIDE1 + side1TopPivot / side1BottomPivot
  //
  // L=长度（主体高度）、W=宽度（FRONT/BACK 宽度）、H=高度
  // （SIDE1/SIDE2/TAB 宽度 + 顶底翼片深度），跟 2D 预览确认过的对应关系一致。
  // ════════════════════════════════════════════════════════════════

  const PANEL_COLOR = 0xbe9871;
  const EDGE_COLOR  = 0x996633;
  const FOLD_COLOR  = 0xd74c4c;
  const CUT_COLOR   = 0x4cb36c;

  const Y_PANEL = 0;
  const Y_EDGE  = 0.3;
  const Y_FOLD  = 0.8;
  const Y_CUT   = 1.2;

  function makeFlatPanel(width, depth) {
    const geo = new THREE.PlaneGeometry(width, depth);
    const mat = new THREE.MeshLambertMaterial({ color: PANEL_COLOR, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  function makeSeg(xA, zA, xB, zB, color, y) {
    const pts = [new THREE.Vector3(xA, y, zA), new THREE.Vector3(xB, y, zB)];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color }));
  }

  // 给一块"列面板"创建一组：面板本体 + 顶部翼片 pivot + 底部翼片 pivot。
  // cx = 面板中心在【调用者局部坐标系】里的 X 坐标，width = 面板宽度。
  // 返回 { columnPivot为null(本体不需要单独pivot，由调用者决定挂在哪), topPivot, bottomPivot }
  function buildColumn(parentGroup, cx, width, L, H, zBodyTop, zBodyBottom) {
    const mesh = makeFlatPanel(width, L);
    mesh.position.set(cx, Y_PANEL, 0);
    parentGroup.add(mesh);
    parentGroup.add(makeSeg(cx - width / 2, zBodyTop, cx + width / 2, zBodyTop, FOLD_COLOR, Y_FOLD));
    parentGroup.add(makeSeg(cx - width / 2, zBodyBottom, cx + width / 2, zBodyBottom, FOLD_COLOR, Y_FOLD));

    const topPivot = new THREE.Group();
    topPivot.position.set(cx, 0, zBodyTop);
    parentGroup.add(topPivot);
    const topMesh = makeFlatPanel(width, H);
    topMesh.position.set(0, 0, -H / 2);
    topPivot.add(topMesh);
    topPivot.add(makeSeg(-width / 2, -H, width / 2, -H, CUT_COLOR, Y_CUT));
    topPivot.add(makeSeg(-width / 2, 0, -width / 2, -H, CUT_COLOR, Y_CUT));
    topPivot.add(makeSeg(width / 2, 0, width / 2, -H, CUT_COLOR, Y_CUT));

    const bottomPivot = new THREE.Group();
    bottomPivot.position.set(cx, 0, zBodyBottom);
    parentGroup.add(bottomPivot);
    const bottomMesh = makeFlatPanel(width, H);
    bottomMesh.position.set(0, 0, H / 2);
    bottomPivot.add(bottomMesh);
    bottomPivot.add(makeSeg(-width / 2, H, width / 2, H, CUT_COLOR, Y_CUT));
    bottomPivot.add(makeSeg(-width / 2, 0, -width / 2, H, CUT_COLOR, Y_CUT));
    bottomPivot.add(makeSeg(width / 2, 0, width / 2, H, CUT_COLOR, Y_CUT));

    return { mesh, topPivot, topMesh, bottomPivot, bottomMesh };
  }

  function buildFivePanel3DModel(dimensions) {
    const L = Math.max(1, Number(dimensions.L) || 200);
    const W = Math.max(1, Number(dimensions.W) || 150);
    const H = Math.max(1, Number(dimensions.H) || 50);

    const root = new THREE.Group();

    const zBodyTop    = -L / 2;
    const zBodyBottom = L / 2;

    // ── BACK（固定参照面，全程不转，直接挂在 root 上）──────────────
    const backCx = 0; // 以 BACK 的中心当作 root 坐标系原点，方便别的组件用相对偏移定位
    const back = buildColumn(root, backCx, W, L, H, zBodyTop, zBodyBottom);
    const backMesh = back.mesh;
    const backTopPivot = back.topPivot;
    const backBottomPivot = back.bottomPivot;

    // ── TAB（独立 pivot，锚点在 TAB｜BACK 接缝，即 root 里 x = W/2）──
    const tabPivot = new THREE.Group();
    tabPivot.position.set(W / 2, 0, 0);
    root.add(tabPivot);
    root.add(makeSeg(W / 2, zBodyTop, W / 2, zBodyBottom, FOLD_COLOR, Y_FOLD)); // TAB｜BACK 折缝（在旋转轴上，不用跟着转）

    const tab = buildColumn(tabPivot, H / 2, H, L, H, zBodyTop, zBodyBottom);
    const tabTopPivot = tab.topPivot;
    const tabBottomPivot = tab.bottomPivot;
    // TAB 最外侧（远离 BACK 的那一边）是真正的裁切边
    tabPivot.add(makeSeg(H, zBodyTop, H, zBodyBottom, CUT_COLOR, Y_CUT));

    // ── leftChainPivot（SIDE1+FRONT+SIDE2 整条，锚点在 SIDE2｜BACK 接缝，即 root 里 x = -W/2）──
    const leftChainPivot = new THREE.Group();
    leftChainPivot.position.set(-W / 2, 0, 0);
    root.add(leftChainPivot);
    root.add(makeSeg(-W / 2, zBodyTop, -W / 2, zBodyBottom, FOLD_COLOR, Y_FOLD)); // SIDE2｜BACK 折缝

    // SIDE2：leftChainPivot 局部坐标里，中心在 x = -H/2
    const side2 = buildColumn(leftChainPivot, -H / 2, H, L, H, zBodyTop, zBodyBottom);
    const side2TopPivot = side2.topPivot;
    const side2BottomPivot = side2.bottomPivot;

    // ── frontChainPivot（FRONT+SIDE1，锚点在 FRONT｜SIDE2 接缝，
    // 即 leftChainPivot 局部坐标里 x = -H）──
    const frontChainPivot = new THREE.Group();
    frontChainPivot.position.set(-H, 0, 0);
    leftChainPivot.add(frontChainPivot);
    leftChainPivot.add(makeSeg(-H, zBodyTop, -H, zBodyBottom, FOLD_COLOR, Y_FOLD)); // FRONT｜SIDE2 折缝

    // FRONT：frontChainPivot 局部坐标里，中心在 x = -W/2
    const front = buildColumn(frontChainPivot, -W / 2, W, L, H, zBodyTop, zBodyBottom);
    const frontTopPivot = front.topPivot;
    const frontBottomPivot = front.bottomPivot;

    // ── side1Pivot（SIDE1，锚点在 SIDE1｜FRONT 接缝，
    // 即 frontChainPivot 局部坐标里 x = -W）──
    const side1Pivot = new THREE.Group();
    side1Pivot.position.set(-W, 0, 0);
    frontChainPivot.add(side1Pivot);
    frontChainPivot.add(makeSeg(-W, zBodyTop, -W, zBodyBottom, FOLD_COLOR, Y_FOLD)); // SIDE1｜FRONT 折缝

    // SIDE1：side1Pivot 局部坐标里，中心在 x = -H/2
    const side1 = buildColumn(side1Pivot, -H / 2, H, L, H, zBodyTop, zBodyBottom);
    const side1TopPivot = side1.topPivot;
    const side1BottomPivot = side1.bottomPivot;
    // SIDE1 最外侧（远离 FRONT 的那一边）是真正的裁切边
    side1Pivot.add(makeSeg(-H, zBodyTop, -H, zBodyBottom, CUT_COLOR, Y_CUT));

    // 展开状态下整个平面图的外轮廓宽/深，给 3D 场景自动调镜头用
    const flatWidth = (3 * H) + (2 * W);
    const flatDepth = (2 * H) + L;

    // 2026-07-03 修正：TAB 只往 +x 方向延伸一块面板，SIDE2+FRONT+SIDE1
    // 那条链子却往 -x 方向延伸三块面板，整个模型的几何中心并不在 x=0，
    // 而是偏在 -(W+H)/2 的位置。fitBounds 是按"模型中心在原点"来算镜头的，
    // 这里把整个 root 平移回正，镜头才能对准真正的几何中心，
    // 不影响里面任何 pivot 的相对位置和旋转逻辑。
    root.position.x = (W + H) / 2;

    return {
      root,
      dimensions: { L, W, H },
      flatWidth,
      flatDepth,
      parts: {
        backMesh,
        backTopPivot, backBottomPivot,
        tabPivot,
        tabTopPivot, tabBottomPivot,
        leftChainPivot,
        side2TopPivot, side2BottomPivot,
        frontChainPivot,
        frontTopPivot, frontBottomPivot,
        side1Pivot,
        side1TopPivot, side1BottomPivot
      }
    };
  }

  window.FivePanel3DModel = { buildFivePanel3DModel };
})();