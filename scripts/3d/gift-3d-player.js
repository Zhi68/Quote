(function () {
  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function easeInOut(value) {
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }

  function segment(progress, start, end) {
    if (progress <= start) return 0;
    if (progress >= end) return 1;
    return (progress - start) / (end - start);
  }

  // 8 个阶段的时间轴分配，风格跟 rsc-3d-player.js / pizza-3d-player.js
  // 一致：每个阶段之间留一点点空隙，避免相邻阶段动作重叠打架
  function applyGiftProgress(model, progress) {
    const p = clamp01(progress);
    const parts = model.parts;

    // Phase 1 (0.00 → 0.11)：SIDE-A 整体（带 TOP/BOT）转向 PANEL-B；
    // GLUE-TAB 转向 PANEL-D。两组动作互不相关，同时进行
    const step1T = easeInOut(segment(p, 0.00, 0.11));
    parts.sideAGroupPivot.rotation.z = -step1T * (Math.PI / 2);
    parts.glueTabPivot.rotation.z = step1T * (Math.PI / 2);

    // Phase 2 (0.14 → 0.25)：PANEL-B 整体（带着已折好的 SIDE-A 整体）
    // 转向 SIDE-C
    const step2T = easeInOut(segment(p, 0.14, 0.25));
    parts.panelBGroupPivot.rotation.z = -step2T * (Math.PI / 2);

    // Phase 3 (0.28 → 0.39)：SIDE-C 整体（带着 PANEL-B、SIDE-A 整体）
    // 转向 PANEL-D。转完之后 GLUE-TAB 正好贴到 SIDE-A 上
    const step3T = easeInOut(segment(p, 0.28, 0.39));
    parts.sideCGroupPivot.rotation.z = -step3T * (Math.PI / 2);

    // Phase 4 (0.42 → 0.53)：方筒立好后，SIDE-A-BOT、SIDE-C-BOT
    // 同时折下
    const step4T = easeInOut(segment(p, 0.42, 0.53));
    parts.sideABotPivot.rotation.x = -step4T * (Math.PI / 2);
    parts.sideCBotPivot.rotation.x = -step4T * (Math.PI / 2);

    // Phase 5 (0.56 → 0.64)：PANEL-D-BOT 折下
    const step5T = easeInOut(segment(p, 0.56, 0.64));
    parts.panelDBotPivot.rotation.x = -step5T * (Math.PI / 2);

    // Phase 6 (0.67 → 0.75)：PANEL-B-BOT 折下，凸起处塞进预留缝里
    const step6T = easeInOut(segment(p, 0.67, 0.75));
    parts.panelBBotPivot.rotation.x = -step6T * (Math.PI / 2);

    // Phase 7 (0.78 → 0.89)：SIDE-A-TOP、SIDE-C-TOP、PANEL-D-LID
    // 同时折下
    const step7T = easeInOut(segment(p, 0.78, 0.89));
    parts.sideATopPivot.rotation.x = step7T * (Math.PI / 2);
    parts.sideCTopPivot.rotation.x = step7T * (Math.PI / 2);
    parts.panelDLidPivot.rotation.x = step7T * (Math.PI / 2);

    // Phase 8 (0.92 → 1.00)：PANEL-D-TOP（带着已折好的 PANEL-D-LID）
    // 折下，PANEL-D-LID 卡进预留缝里，箱子成型
    const step8T = easeInOut(segment(p, 0.92, 1.00));
    parts.panelDTopPivot.rotation.x = step8T * (Math.PI / 2);
  }

  window.Gift3DPlayer = {
    applyGiftProgress
  };
})();