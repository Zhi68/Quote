(function () {
    // Pizza Box 3D 预览的挂载逻辑，参照 rsc-3d-preview.js /
    // five-panel-3d-preview.js 的结构。
    //
    // 3D 场景（相机/灯光/渲染器）复用 window.Box3DScene.createScene()，
    // 跟 RSC Box、5 Panel Box 共用同一个渲染器实例——同一块 <canvas>
    // 只能绑一个 WebGL 上下文，createScene 内部有缓存，重复调用同一块
    // canvas 会直接返回现成的场景，不会冲突。
    //
    // 播放/暂停/进度条这一套 UI，也是跟 RSC / 5 Panel Box 共用同一批
    // DOM 元素（同一块 3D 预览面板），所以每个按钮回调开头都要先检查
    // "现在这套控制条是不是我在用"（isActiveOwner），不是的话直接不
    // 处理，避免几个箱型的按钮回调互相触发。
    const DEFAULT_DURATION = 15;
    let sceneApi = null;
    let currentModel = null;
    let currentDimensions = null;
    let currentProgress = 0;
    let isPlaying = false;
    let lastTs = 0;
  let isPanMode = false;
  
    let els = null;
  
    // 缓存一次性拿到的 DOM 元素引用，避免每次都重新查询
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
  
    // 显示/隐藏覆盖在画布上的提示文字（比如初始化失败的报错信息）
    function setOverlay(text, visible) {
      const ui = getEls();
      ui.overlay.textContent = text || "";
      ui.overlay.classList.toggle("is-hidden", !visible);
    }
  
    // 显示/隐藏播放/进度条/复位这一整条控制条
    function setControlsVisible(visible) {
      const ui = getEls();
      ui.controls.classList.toggle("is-hidden", !visible);
    }
  
    // 切换播放/暂停状态：
    // 播放时锁定缩放（避免拖动进度条的同时还能缩放，体验冲突），
    // 每次开始播放都重新对齐一次镜头（防止上次暂停时手动缩放/旋转过）；
    // 暂停时开放缩放，手动 render 一帧保持画面停在当前进度
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
  
    // 把当前进度同步到进度条滑块上（0~1 换算成滑块的 0~1000）
    function syncRange() {
      const ui = getEls();
      ui.range.value = String(Math.round(currentProgress * 1000));
    }
  
    // 把折叠进度（0~1）应用到模型上，并重新渲染一帧
    function applyProgress(progress) {
      currentProgress = Math.max(0, Math.min(1, progress));
  
      if (currentModel) {
        window.Pizza3DPlayer.applyPizzaProgress(currentModel, currentProgress);
      }
  
      syncRange();
  
      if (sceneApi) {
        sceneApi.render();
      }
    }
  
    // 播放完成后再次点击播放：从头开始重新播一遍
    function restartPlaybackFromBeginning() {
      applyProgress(0);
      setPlayingState(true);
    }
  
    // 播放循环：按真实时间流逝推进折叠进度，播到头自动停在暂停状态
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
  
    // 判断现在这一套播放控制，操作对象是不是"我自己"（Pizza Box），
    // 用来在跟 RSC / 5 Panel Box 共用同一批按钮 DOM 时，避免互相误触
    function isActiveOwner() {
      return document.body.dataset.active3DBox === "pizza";
    }
  
    // 给播放/进度条/复位这几个按钮绑一次点击事件（用 dataset 标记位
    // 防止重复绑定）。三个回调开头都先用 isActiveOwner() 检查一遍，
    // 不是自己在用就直接 return，交给当前真正在用的那个箱型处理
    function bindUiOnce() {
      const ui = getEls();
  
      if (ui.playBtn.dataset.pizzaBound === "1") {
        return;
      }
  
      ui.playBtn.dataset.pizzaBound = "1";
  
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
  
    // 拿到（或者第一次调用时创建）共用的 3D 场景，顺带绑一次 UI 事件
    function ensureScene() {
      const ui = getEls();
  
      if (!sceneApi) {
        sceneApi = window.Box3DScene.createScene(ui.canvas);
        bindUiOnce();
      }
  
      return sceneApi;
    }
  
    // 把 Pizza Box 挂载到 3D 场景里：建模型、对好镜头、标记"现在是
    // 我在用这套控制条"、展开控制条、从头(progress=0)开始展示
    function mountPizza(dimensions) {
      const ui = getEls();
  
      try {
        const api = ensureScene();
  
        currentDimensions = {
          L: Number(dimensions.L) || 200,
          W: Number(dimensions.W) || 150,
          H: Number(dimensions.H) || 50
        };
  
        currentModel = window.Pizza3DModel.buildPizza3DModel(currentDimensions);
        api.attachModel(currentModel.root);
        api.fitBounds(currentModel.flatWidth, currentModel.flatDepth, {
          targetX: 0,
          distanceRatio: 1.2,
          elevationAngle: 0.5,
          azimuthAngle: - 4.7125
        });
  
        document.body.dataset.active3DBox = "pizza";
  
        setOverlay("", false);
        setControlsVisible(true);
        ui.stage.classList.remove("is-hidden");
  
        isPanMode = false;
      if (ui.panBtn) ui.panBtn.classList.remove("active");
      setPlayingState(false);
        applyProgress(0);
      } catch (error) {
        console.error("Pizza Box 3D 预览初始化失败：", error);
        ui.stage.classList.remove("is-hidden");
        setControlsVisible(false);
        setOverlay("3D 预览初始化失败，请查看浏览器控制台报错信息。", true);
      }
    }
  
    // 切换到其它箱型/2D 预览时调用：暂停动画、停掉渲染循环、隐藏面板
    function hide() {
      const ui = getEls();
      setPlayingState(false);
      if (sceneApi) {
        sceneApi.stopLoop();
      }
      ui.stage.classList.add("is-hidden");
      setControlsVisible(false);
    }
  
    window.Pizza3DPreview = {
      mountPizza,
      hide
    };
  })();