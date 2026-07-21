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

  function applyFivePanelProgress(model, progress) {
    const p = clamp01(progress);
    const parts = model.parts;

    // Phase 1 (0.00 → 0.14)：SIDE2-TOP/BOTTOM 折向 SIDE2；
    // TAB-TOP/BOTTOM 折向 TAB，两组动作互不相关，同时进行
    const step1T = easeInOut(segment(p, 0.00, 0.14));
    parts.side2TopPivot.rotation.x = step1T * (Math.PI / 2);
    parts.side2BottomPivot.rotation.x = -step1T * (Math.PI / 2);
    parts.tabTopPivot.rotation.x = step1T * (Math.PI / 2);
    parts.tabBottomPivot.rotation.x = -step1T * (Math.PI / 2);

    // Phase 2 (0.17 → 0.31)：SIDE1+FRONT+SIDE2 整条转向 BACK；
    // TAB 整体转向 BACK。BACK 全程不转，是固定参照面
    const step2T = easeInOut(segment(p, 0.17, 0.31));
    parts.leftChainPivot.rotation.z = -step2T * (Math.PI / 2);
    parts.tabPivot.rotation.z = step2T * (Math.PI / 2);

    // Phase 3 (0.34 → 0.45)：BACK-TOP/BOTTOM 折向 BACK
    const step3T = easeInOut(segment(p, 0.34, 0.45));
    parts.backTopPivot.rotation.x = step3T * (Math.PI / 2);
    parts.backBottomPivot.rotation.x = -step3T * (Math.PI / 2);

    // Phase 4 (0.48 → 0.62)：SIDE1-TOP/BOTTOM 折向 SIDE1；
    // FRONT-TOP/BOTTOM 折向 FRONT，同时进行
    const step4T = easeInOut(segment(p, 0.48, 0.62));
    parts.side1TopPivot.rotation.x = step4T * (Math.PI / 2);
    parts.side1BottomPivot.rotation.x = -step4T * (Math.PI / 2);
    parts.frontTopPivot.rotation.x = step4T * (Math.PI / 2);
    parts.frontBottomPivot.rotation.x = -step4T * (Math.PI / 2);

    // Phase 5 (0.65 → 0.80)：FRONT 带着 SIDE1 一起转向 SIDE2
    const step5T = easeInOut(segment(p, 0.65, 0.80));
    parts.frontChainPivot.rotation.z = -step5T * (Math.PI / 2);

    // Phase 6 (0.83 → 1.00)：SIDE1 再单独转向 FRONT，扣进预留缺口，完成
    const step6T = easeInOut(segment(p, 0.83, 1.00));
    parts.side1Pivot.rotation.z = -step6T * (Math.PI / 2);
  }

  window.FivePanel3DPlayer = {
    applyFivePanelProgress
  };
})();