(function () {
  // 场景缓存：同一块 canvas 只能绑一个 WebGL 渲染器。以后 5 Panel Box
  // 等其它箱型的 3D 预览也会调用这个 createScene，传进来的是同一块
  // <canvas>，这里做缓存直接把现成的场景对象返回，不会重复建渲染器导致冲突。
  const sceneCache = new Map();

  function createScene(canvas) {
    if (sceneCache.has(canvas)) {
      return sceneCache.get(canvas);
    }
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvas.clientWidth || canvas.width || 300, canvas.clientHeight || canvas.height || 150, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7fbff);

    const camera = new THREE.PerspectiveCamera(
      35,
      (canvas.clientWidth || 300) / (canvas.clientHeight || 150),
      0.1,
      5000
    );

    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 120;
    controls.maxDistance = 1200;

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dir1.position.set(180, 220, 260);
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dir2.position.set(-180, 120, -200);
    scene.add(dir2);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    let animationFrameId = 0;

    function render() {
      controls.update();
      renderer.render(scene, camera);
    }

    function startLoop() {
      stopLoop();

      const tick = () => {
        render();
        animationFrameId = window.requestAnimationFrame(tick);
      };

      tick();
    }

    function stopLoop() {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
    }

    function setZoomEnabled(enabled) {
      controls.enableZoom = !!enabled;
    }

    function setRotateEnabled(enabled) {
      controls.enableRotate = !!enabled;
    }

    // 切换鼠标左键长按拖拽的行为：关闭(false)=转动镜头（默认），
    // 开启(true)=平移画面。OrbitControls 自带这个映射表
    // （controls.mouseButtons.LEFT），不用自己写拖拽逻辑，
    // 改一下映射到的动作类型就行
    function setPanMode(enabled) {
      controls.enablePan = true;
      controls.mouseButtons.LEFT = enabled ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    }

    function clearRoot() {
      while (rootGroup.children.length) {
        const child = rootGroup.children[0];
        rootGroup.remove(child);
      }
    }

    function attachModel(root) {
      clearRoot();
      if (root) {
        rootGroup.add(root);
      }
      render();
    }

    // ### 旧备注（以防万一需要） ###
    // 通用镜头适配：传"展开图整体的宽/深"，自动把相机摆到能看全整个
    // 展开图的位置。第三个参数 options 是可选的，每个箱型可以按自己
    // 的形状特点，传一套专属的镜头参数进来，不传就用下面这套通用
    // 默认值——以后新增箱型，如果还没想好要用什么参数，先用这套
    // 默认值占位就行，不会报错、也不会太难看：
    //   targetX: 0, targetZ: 0, sideRatio: 0,
    //   elevationRatio: 0.55, distanceRatio: 0.9
    //   targetX / targetZ  = 镜头看向哪个点（默认看向原点，如果这个
    //                        箱型的"固定参照面"不在整条展开图的几何
    //                        中心，可以传具体坐标，比如 RSC 传 FRONT
    //                        PANEL 的中心、Gift Box 传 PANEL-D 的中心）
    //   sideRatio          = 镜头左右偏移多少（相对 flatWidth 的比例）
    //   elevationRatio     = 镜头抬高多少（相对 flatWidth 的比例）
    //   distanceRatio      = 镜头离多远（相对 flatWidth 的比例）
    // 这几个参数只影响"摆镜头"这一下，不影响模型本身、也不影响
    // 折叠动画，每个箱型自己的 preview.js 想怎么调都不会影响别的箱型。
    // ————————————————————————————————————————————————————————————————————————
    // ### 新备注 ###
    // 通用镜头适配：distanceRatio（镜头离多远）、elevationAngle（仰角，
    // 弧度）、azimuthAngle（左右方位角，弧度）这三个参数是真正互相独立
    // 的——球坐标写法，不是简单把 X/Y/Z 三个偏移量加在一起。改其中
    // 任何一个，另外两个的效果都不会被牵动：
    //   distanceRatio  = 镜头离目标点多远（相对 flatWidth 的比例）
    //   elevationAngle = 仰角，单位弧度。0 = 完全水平；正数越大镜头
    //                    越往上看（俯视）；可以填负数变成仰视
    //   azimuthAngle   = 左右方位角，单位弧度。0 = 正对目标点正前方；
    //                    正数往左转，负数往右转（跟 Math.PI 一样是弧度制，
    //                    180° = Math.PI，90° = Math.PI/2，以此类推）
    function fitBounds(flatWidth, flatDepth, options) {
      const opts = options || {};
      const w = Math.max(flatWidth || 300, 1);
      const d = Math.max(flatDepth || 150, 1);
      const targetX = opts.targetX || 0;
      const targetZ = opts.targetZ || 0;
      const distanceRatio = opts.distanceRatio != null ? opts.distanceRatio : 0.9;
      const elevationAngle = opts.elevationAngle != null ? opts.elevationAngle : 0.5;
      const azimuthAngle = opts.azimuthAngle != null ? opts.azimuthAngle : 0;

      const R = w * distanceRatio;
      camera.position.set(
        targetX + R * Math.cos(elevationAngle) * Math.sin(azimuthAngle),
        R * Math.sin(elevationAngle),
        targetZ + R * Math.cos(elevationAngle) * Math.cos(azimuthAngle)
      );
      controls.target.set(targetX, 0, targetZ);
      controls.update();

      controls.minDistance = d * 0.5;
      controls.maxDistance = w * 4;

      render();
    }

    function handleResize() {
      const width = canvas.clientWidth || 300;
      const height = canvas.clientHeight || 150;

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    }

    window.addEventListener("resize", handleResize);

    const api = {
      scene,
      camera,
      controls,
      renderer,
      attachModel,
      fitBounds,
      setZoomEnabled,
      setRotateEnabled,
      setPanMode,
      render,
      startLoop,
      stopLoop,
      handleResize
    };

    sceneCache.set(canvas, api);
    return api;
  }

  window.Box3DScene = {
    createScene
  };
})();