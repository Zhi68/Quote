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
  
    // 8 个阶段的时间轴分配，跟 rsc-3d-player.js / five-panel-3d-player.js
    // 风格一致：每个阶段之间留一点点空隙，避免相邻阶段动作重叠打架
    function applyPizzaProgress(model, progress) {
      const p = clamp01(progress);
      const parts = model.parts;
  
      // Phase 1 (0.00 → 0.10)：HINGE 和 BASE-SIDE 各自的耳朵先折起来
      const step1T = easeInOut(segment(p, 0.00, 0.10));
      parts.hingeEarTopPivot.rotation.x = step1T * (Math.PI / 2);
      parts.hingeEarBotPivot.rotation.x = -step1T * (Math.PI / 2);
      parts.baseSideEarTopPivot.rotation.x = step1T * (Math.PI / 2);
      parts.baseSideEarBotPivot.rotation.x = -step1T * (Math.PI / 2);
  
      // Phase 2 (0.13 → 0.23)：HINGE 整体（带着 LID、LID-SIDE 一起）
      // 朝 BASE 转过去；BASE-SIDE 整体朝 BASE 转过去（从另一侧靠拢）
      const step2T = easeInOut(segment(p, 0.13, 0.23));
      parts.hingeGroupPivot.rotation.z = -step2T * (Math.PI / 2);
      parts.baseSideGroupPivot.rotation.z = step2T * (Math.PI / 2);
  
      // Phase 3 (0.26 → 0.36)：BASE 顶部/底部的 FOLD-INNER 整条
      // （带着 MID-PANEL、FOLD-OUTER+锁扣）朝 BASE 折下去
      const step3T = easeInOut(segment(p, 0.26, 0.36));
      parts.topFoldInnerPivot.rotation.x = step3T * (Math.PI / 2);
      parts.botFoldInnerPivot.rotation.x = -step3T * (Math.PI / 2);
  
      // Phase 4 (0.39 → 0.49)：MID-PANEL（带着 FOLD-OUTER+锁扣）
      // 相对 FOLD-INNER 再折一次
      const step4T = easeInOut(segment(p, 0.39, 0.49));
      parts.topMidPanelPivot.rotation.x = step4T * (Math.PI / 2);
      parts.botMidPanelPivot.rotation.x = -step4T * (Math.PI / 2);
  
      // Phase 5 (0.52 → 0.62)：FOLD-OUTER（含锁扣舌片）相对 MID-PANEL
      // 再折一次，锁扣正好扣进卡槽
      const step5T = easeInOut(segment(p, 0.52, 0.62));
      parts.topFoldOuterPivot.rotation.x = step5T * (Math.PI / 2);
      parts.botFoldOuterPivot.rotation.x = -step5T * (Math.PI / 2);
  
      // Phase 6 (0.65 → 0.75)：LID-SIDE 的耳朵、LID-FRONT/LID-BACK
      // 同时折起来
      const step6T = easeInOut(segment(p, 0.65, 0.75));
      parts.lidSideEarTopPivot.rotation.x = step6T * (Math.PI / 2);
      parts.lidSideEarBotPivot.rotation.x = -step6T * (Math.PI / 2);
      parts.lidFrontPivot.rotation.x = step6T * (Math.PI / 2);
      parts.lidBackPivot.rotation.x = -step6T * (Math.PI / 2);
  
      // Phase 7 (0.78 → 0.90)：LID 整体（带着 LID-SIDE 一起）朝 HINGE 转过去
      const step7T = easeInOut(segment(p, 0.78, 0.90));
      parts.lidGroupPivot.rotation.z = -step7T * (Math.PI / 2);
  
      // Phase 8 (0.93 → 1.00)：LID-SIDE 单独再朝 LID 转一次，
      // 耳朵塞进预留的小孔，箱子折叠完成
      const step8T = easeInOut(segment(p, 0.93, 1.00));
      parts.lidSidePivot.rotation.z = -step8T * (Math.PI / 2);
    }
  
    window.Pizza3DPlayer = {
      applyPizzaProgress
    };
  })();