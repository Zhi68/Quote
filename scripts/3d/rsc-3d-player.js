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

  // 2026-07-08 改基底：原来是 RIGHT SIDE 固定不动、FRONT+LEFT SIDE 转过去；
  // 现在改成 FRONT 固定不动，LEFT SIDE 单独转过去，RIGHT SIDE（带着
  // 已经贴合好的 BACK+TAB）整体转过去。5 个阶段：
  function applyRSCProgress(model, progress) {
    const p = clamp01(progress);
    const parts = model.parts;

    // Phase 1 (0.00 → 0.22)：LEFT SIDE 局部折向 FRONT（FRONT 不动）；
    // TAB 局部折向 BACK。两个动作互不相关，同时进行
    const step1T = easeInOut(segment(p, 0.00, 0.22));
    parts.leftSidePivot.rotation.z = -step1T * (Math.PI / 2);
    parts.tabPivot.rotation.z = step1T * (Math.PI / 2);

    // Phase 2 (0.25 → 0.40)：BACK 整体（带着已经折好的 TAB）先贴到
    // RIGHT SIDE 上（这时候 RIGHT SIDE 自己还没转，仍然摊平着）
    const step2T = easeInOut(segment(p, 0.25, 0.40));
    parts.backGroupPivot.rotation.z = step2T * (Math.PI / 2);

    // Phase 3 (0.43 → 0.58)：RIGHT SIDE 整体（带着上一步已经贴合好的
    // BACK+TAB）转向 FRONT，方筒闭合
    const step3T = easeInOut(segment(p, 0.43, 0.58));
    parts.rightGroupPivot.rotation.z = step3T * (Math.PI / 2);

    // Phase 4 (0.61 → 0.78)：方筒立好后，LEFT SIDE / RIGHT SIDE 两侧的
    // 防尘襟片（窄翼片）同时折下
    const step4T = easeInOut(segment(p, 0.61, 0.78));
    parts.topDustLeftPivot.rotation.x = step4T * (Math.PI / 2);
    parts.botDustLeftPivot.rotation.x = -step4T * (Math.PI / 2);
    parts.topDustRightPivot.rotation.x = step4T * (Math.PI / 2);
    parts.botDustRightPivot.rotation.x = -step4T * (Math.PI / 2);

    // Phase 5 (0.81 → 1.00)：FRONT / BACK 两边的主翼片（宽翼片）同时
    // 折下，盖住窄翼片，完成整箱
    const step5T = easeInOut(segment(p, 0.81, 1.00));
    parts.topMainFrontPivot.rotation.x = step5T * (Math.PI / 2);
    parts.botMainFrontPivot.rotation.x = -step5T * (Math.PI / 2);
    parts.topMainBackPivot.rotation.x = step5T * (Math.PI / 2);
    parts.botMainBackPivot.rotation.x = -step5T * (Math.PI / 2);
  }

  window.RSC3DPlayer = {
    applyRSCProgress
  };
})();