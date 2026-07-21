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
        targetX: 0,
        distanceRatio: 1.2,
        elevationAngle: 0.5,
        azimuthAngle: - 4.7125
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
      window.FivePanel3DPlayer.applyFivePanelProgress(currentModel, currentProgress);
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

    if (ui.playBtn.dataset.fivePanelBound === "1") {
      return;
    }

    ui.playBtn.dataset.fivePanelBound = "1";

    // 注意：播放/进度条/复位这几个按钮 DOM 元素跟 RSC Box 3D 预览是
    // 共用的（同一块面板），RSC 那边在 rsc-3d-preview.js 里已经绑过一次
    // click 事件了。这里不能重复 addEventListener，否则点一下会触发两次
    // 回调（RSC 的 + 这边的）。做法是：每次点击时先检查“当前挂载的是不是
    // 我自己的模型”（currentModel 是否等于最近一次 mount 的结果），
    // 不是的话直接不处理，交给 RSC 那边的绑定去处理。
    ui.playBtn.addEventListener("click", () => {
      if (!isActiveOwner()) return;

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
      if (!isActiveOwner()) return;
      setPlayingState(false);
      applyProgress(Number(ui.range.value) / 1000);
    });

    ui.resetBtn.addEventListener("click", () => {
      if (!isActiveOwner()) return;
      if (sceneApi && currentModel) {
        sceneApi.fitBounds(currentModel.flatWidth, currentModel.flatDepth, {
          targetX: 0,
          distanceRatio: 1.2,
          elevationAngle: 0.5,
          azimuthAngle: - 4.7125
        });
      }
    });

    ui.panBtn.addEventListener("click", () => {
      if (!isActiveOwner()) return;
      isPanMode = !isPanMode;
      sceneApi.setPanMode(isPanMode);
      ui.panBtn.classList.toggle("active", isPanMode);
    });
  }

  // 判断现在这一套播放控制，操作对象是不是"我自己"（FivePanel），
  // 用来在跟 RSC 共用同一批按钮 DOM 时，避免互相误触
  function isActiveOwner() {
    return document.body.dataset.active3DBox === "5-panel";
  }

  function ensureScene() {
    const ui = getEls();

    if (!sceneApi) {
      sceneApi = window.Box3DScene.createScene(ui.canvas);
      bindUiOnce();
    }

    return sceneApi;
  }

  function mountFivePanel(dimensions) {
    const ui = getEls();

    try {
      const api = ensureScene();

      currentDimensions = {
        L: Number(dimensions.L) || 200,
        W: Number(dimensions.W) || 150,
        H: Number(dimensions.H) || 50
      };

      currentModel = window.FivePanel3DModel.buildFivePanel3DModel(currentDimensions);
      api.attachModel(currentModel.root);
      api.fitBounds(currentModel.flatWidth, currentModel.flatDepth, {
        targetX: 0,
        distanceRatio: 1.2,
        elevationAngle: 0.5,
        azimuthAngle: - 4.7125
      });

      document.body.dataset.active3DBox = "5-panel";

      setOverlay("", false);
      setControlsVisible(true);
      ui.stage.classList.remove("is-hidden");

      isPanMode = false;
      if (ui.panBtn) ui.panBtn.classList.remove("active");
      setPlayingState(false);
      applyProgress(0);
    } catch (error) {
      console.error("5 Panel Box 3D 预览初始化失败：", error);
      ui.stage.classList.remove("is-hidden");
      setControlsVisible(false);
      setOverlay("3D 预览初始化失败，请查看浏览器控制台报错信息。", true);
    }
  }

  function hide() {
    const ui = getEls();
    setPlayingState(false);
    if (sceneApi) {
      sceneApi.stopLoop();
    }
    ui.stage.classList.add("is-hidden");
    setControlsVisible(false);
  }

  window.FivePanel3DPreview = {
    mountFivePanel,
    hide
  };
})();