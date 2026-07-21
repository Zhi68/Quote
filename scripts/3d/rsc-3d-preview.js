(function () {
  const DEFAULT_DURATION = 15;
  let sceneApi = null;
  let currentModel = null;
  let currentDimensions = null;
  let currentProgress = 0;
  let isPlaying = false;
  let lastTs = 0;
  let isPanMode = false;

  let els = null;

  function getEls() {
    if (els) return els;

    els = {
      stage: document.getElementById("preview3DStage"),
      canvas: document.getElementById("preview3DCanvas"),
      overlay: document.getElementById("preview3DOverlay"),
      controls: document.getElementById("preview3DControls"),
      playBtn: document.getElementById("preview3DPlayBtn"),
      range: document.getElementById("preview3DRange"),
      resetBtn: document.getElementById("preview3DResetBtn"),
      panBtn: document.getElementById("preview3DPanBtn"),
      hint: document.getElementById("preview3DHint")
    };

    return els;
  }

  function setOverlay(text, visible) {
    const ui = getEls();
    ui.overlay.textContent = text || "";
    ui.overlay.classList.toggle("is-hidden", !visible);
  }

  function setControlsVisible(visible) {
    const ui = getEls();
    ui.controls.classList.toggle("is-hidden", !visible);
  }

  function setPlayingState(nextPlaying) {
    isPlaying = !!nextPlaying;

    const ui = getEls();
    ui.playBtn.textContent = isPlaying ? "❚❚" : "▶";

    if (!sceneApi) return;

    sceneApi.setRotateEnabled(true);

    if (isPlaying) {
      sceneApi.setZoomEnabled(true);
      sceneApi.fitBounds(currentModel.flatWidth, currentModel.flatDepth, {
        targetX: currentModel.focusX,
        distanceRatio: 0.83,
        elevationAngle: 0.219,
        azimuthAngle: 0.149
      });
      lastTs = 0;
      sceneApi.startLoop();
      window.requestAnimationFrame(step);
    } else {
      sceneApi.setZoomEnabled(true);
      sceneApi.render();
    }
  }

  function syncRange() {
    const ui = getEls();
    ui.range.value = String(Math.round(currentProgress * 1000));
  }

  function applyProgress(progress) {
    currentProgress = Math.max(0, Math.min(1, progress));

    if (currentModel) {
      window.RSC3DPlayer.applyRSCProgress(currentModel, currentProgress);
    }

    syncRange();

    if (sceneApi) {
      sceneApi.render();
    }
  }

  function restartPlaybackFromBeginning() {
    applyProgress(0);
    setPlayingState(true);
  }

  function step(ts) {
    if (!isPlaying) return;

    if (!lastTs) {
      lastTs = ts;
    }

    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    const next = currentProgress + (dt / DEFAULT_DURATION);

    if (next >= 1) {
      applyProgress(1);
      setPlayingState(false);
      return;
    }

    applyProgress(next);
    window.requestAnimationFrame(step);
  }

  function bindUiOnce() {
    const ui = getEls();

    if (ui.playBtn.dataset.bound === "1") {
      return;
    }

    ui.playBtn.dataset.bound = "1";

    ui.playBtn.addEventListener("click", () => {
      if (document.body.dataset.active3DBox !== "rsc") return;

      if (isPlaying) {
          setPlayingState(false);
          return;
      }

      if (currentProgress >= 1) {
          restartPlaybackFromBeginning();
          return;
      }

      setPlayingState(true);
    });

    ui.range.addEventListener("input", () => {
      if (document.body.dataset.active3DBox !== "rsc") return;
      setPlayingState(false);
      applyProgress(Number(ui.range.value) / 1000);
    });

    ui.resetBtn.addEventListener("click", () => {
      if (document.body.dataset.active3DBox !== "rsc") return;
      if (sceneApi && currentModel) {
        sceneApi.fitBounds(currentModel.flatWidth, currentModel.flatDepth, {
          targetX: currentModel.focusX,
          distanceRatio: 0.83,
          elevationAngle: 0.219,
          azimuthAngle: 0.149
        });
      }
    });

    ui.panBtn.addEventListener("click", () => {
      if (document.body.dataset.active3DBox !== "rsc") return;
      isPanMode = !isPanMode;
      sceneApi.setPanMode(isPanMode);
      ui.panBtn.classList.toggle("active", isPanMode);
    });
  }

  function ensureScene() {
    const ui = getEls();

    if (!sceneApi) {
      sceneApi = window.Box3DScene.createScene(ui.canvas);
      bindUiOnce();
    }

    return sceneApi;
  }

  function mountRSC(dimensions) {
    const ui = getEls();
  
    try {
      const api = ensureScene();

      document.body.dataset.active3DBox = "rsc";

      currentDimensions = {
        L: Number(dimensions.L) || 300,
        W: Number(dimensions.W) || 100,
        H: Number(dimensions.H) || 100
      };
  
      currentModel = window.RSC3DModel.buildRSC3DModel(currentDimensions);

      // ## 重要备注（不可删除）##
      // 调整rsc展示角度（调整：“-Math.PI / 2” 这边的数值即可）
      // 注：单位是弧度，Math.PI = 180°，所以想填"多少度"，公式是：角度数 / 180 * Math.PI
      // —————————————————————————————————————————————————————————————————————————————
      // 例子参考（具体看自身需求调整）：
      // 效果：完全躺平(不转,原始状态)； 填：0（已测试）
      // 效果：完全立起来(平视，90°效果)； 填：Math.PI / 2（已测试）
      // 效果：翻转； 填：Math.PI（已测试）
      // 效果：立起来但反面（-90°/270°）； 填：-Math.PI / 2（已测试）
      // 效果：只转一半,斜靠着(约 45°)； 填：-Math.PI / 4
      // 效果：只转小小一点,还是接近躺平但微微立起； 填：-Math.PI / 6（30°）或者更小，比如 -Math.PI / 8 （22.5°）
      const displayGroup = new THREE.Group();
      displayGroup.rotation.x = Math.PI / 2;   // 调整在这行
      displayGroup.add(currentModel.root);
      api.attachModel(displayGroup);

      api.fitBounds(currentModel.flatWidth, currentModel.flatDepth, {
        targetX: currentModel.focusX,
        distanceRatio: 0.83,
        elevationAngle: 0.219,
        azimuthAngle: 0.149
      });
  
      setOverlay("", false);
      setControlsVisible(true);
      ui.stage.classList.remove("is-hidden");
  
      isPanMode = false;
      if (ui.panBtn) ui.panBtn.classList.remove("active");
      setPlayingState(false);
      applyProgress(0);
    } catch (error) {
      console.error("RSC 3D preview failed to initialize:", error);
      ui.stage.classList.remove("is-hidden");
      setControlsVisible(false);
      setOverlay(
        "3D preview failed to initialize. Please check the browser console for details.",
        true
      );
    }
  }

  function showUnsupported(message) {
    const ui = getEls();

    ui.stage.classList.remove("is-hidden");
    setControlsVisible(false);
    setOverlay(message || "3D preview is not available for this box type yet.", true);
  }

  function hide() {
    const ui = getEls();
    setPlayingState(false);
    ui.stage.classList.add("is-hidden");
    setControlsVisible(false);
  }

  window.RSC3DPreview = {
    mountRSC,
    showUnsupported,
    hide,
    setPlayingState,
    applyProgress
  };
})();