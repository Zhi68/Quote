(function () {
  // Gift Box 3D 预览的挂载逻辑，参照 pizza-3d-preview.js 的结构。
  //
  // 3D 场景（相机/灯光/渲染器）复用 window.Box3DScene.createScene()，
  // 跟 RSC / 5 Panel Box / Pizza Box 共用同一个渲染器实例（同一块
  // <canvas>，一块 canvas 只能绑一个 WebGL 上下文，createScene 内部
  // 有缓存，重复调用同一块 canvas 会直接返回现成的场景，不会冲突）。
  //
  // 播放/暂停/进度条这一套 UI，也是跟其它箱型共用同一批 DOM 元素
  // （同一块 3D 预览面板），所以每个按钮回调开头都要先检查"现在这套
  // 控制条是不是我在用"（isActiveOwner），不是的话直接不处理，
  // 避免几个箱型的按钮回调互相触发。
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

  // 切换播放/暂停状态：播放时锁定缩放并重新对齐镜头，暂停时开放缩放
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
        distanceRatio: 1.2,
        elevationAngle: 0.5,
        azimuthAngle: 0
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
      window.Gift3DPlayer.applyGiftProgress(currentModel, currentProgress);
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

  // 判断现在这一套播放控制，操作对象是不是"我自己"（Gift Box）
  function isActiveOwner() {
    return document.body.dataset.active3DBox === "gift";
  }

  function bindUiOnce() {
    const ui = getEls();

    if (ui.playBtn.dataset.giftBound === "1") {
      return;
    }

    ui.playBtn.dataset.giftBound = "1";

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
          targetX: currentModel.focusX,
          distanceRatio: 1.2,
          elevationAngle: 0.5,
          azimuthAngle: 0
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

  function ensureScene() {
    const ui = getEls();

    if (!sceneApi) {
      sceneApi = window.Box3DScene.createScene(ui.canvas);
      bindUiOnce();
    }

    return sceneApi;
  }

  function mountGift(dimensions) {
    const ui = getEls();

    try {
      const api = ensureScene();

      currentDimensions = {
        L: Number(dimensions.L) || 120,
        W: Number(dimensions.W) || 80,
        H: Number(dimensions.H) || 150
      };

      currentModel = window.Gift3DModel.buildGift3DModel(currentDimensions);
      const displayGroup = new THREE.Group();
      displayGroup.rotation.x = Math.PI / 2;
      displayGroup.add(currentModel.root);
      api.attachModel(displayGroup);

      api.fitBounds(currentModel.flatWidth, currentModel.flatDepth, {
        targetX: currentModel.focusX,
        distanceRatio: 1.2,
        elevationAngle: 0.5,
        azimuthAngle: 0
      });

      document.body.dataset.active3DBox = "gift";

      setOverlay("", false);
      setControlsVisible(true);
      ui.stage.classList.remove("is-hidden");

      isPanMode = false;
      if (ui.panBtn) ui.panBtn.classList.remove("active");
      setPlayingState(false);
      applyProgress(0);
    } catch (error) {
      console.error("Gift Box 3D 预览初始化失败：", error);
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

  window.Gift3DPreview = {
    mountGift,
    hide
  };
})();