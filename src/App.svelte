<script>
  import { onMount } from "svelte";

  let activeTool = "none";

  const toolLegend = {
    none: [
      { icon: "left", label: "Pan" },
      { icon: "middle", label: "Pan" },
      { icon: "scroll", label: "Zoom" }
    ],
    pen: [
      { icon: "left", label: "Add point" },
      { icon: "right", label: "Remove last" },
      { icon: "middle", label: "Pan" },
      { icon: "scroll", label: "Zoom" }
    ],
    move: [
      { icon: "left", label: "Move / insert point" },
      { icon: "right", label: "Remove point" },
      { icon: "middle", label: "Pan" },
      { icon: "scroll", label: "Zoom" }
    ]
  };

  let selectedPointIndex = null;
  let isMovingPoint = false;

  // ===== CAMERA =====
  let scale = 0.1;
  let minScale = 0.05;
  let maxScale = 10;

  let pos = { x: 0, y: 0 };
  let dragging = false;
  let last = { x: 0, y: 0 };

  let viewportEl;

  // ===== MAP =====
  const MAP_SIZE = 8192;

  let mapOptions = [
    { key: "map1", label: "Atlas", src: "/map.png" },
    { key: "map2", label: "Roads", src: "/map2.jpg" },
    { key: "map3", label: "Satellite", src: "/map3.jpg" }
  ];

  let currentMap = mapOptions[0].src;
  let edgeColor = "#0c0f12";
  let mapWidth = MAP_SIZE;
  let mapHeight = MAP_SIZE;
  let customMapInputEl;

  // ===== UI =====
  let showImportModal = false;
  let importText = "";
  let importedCheckpoints = [];

  let showImportPathModal = false;
  let importPathText = "";

  let showExportModal = false;
  let exportText = "";

  let showClearConfirm = false;

  let showMapMenu = false;
  let showColorMenu = false;

  let checkpointHue = 0;
  let lineHue = 200;

  function hueToColor(h) {
    return `hsl(${h}, 100%, 55%)`;
  }

  function oppositeColor(h) {
    return hueToColor((h + 180) % 360);
  }

  let pathPoints = [];   // confirmed points
  let isDrawing = false; // are we currently drawing

  // ===== DEBUG =====
  let worldMouse = { x: 0, y: 0 };

  // ===== CANVAS =====
  let canvasEl;
  let ctx;

  onMount(() => {
    preloadImages();
    loadMapMeta(currentMap);

    ctx = canvasEl.getContext("2d");

    draw(); // initial draw

    window.addEventListener("keydown", handleKeydown);
  });

  // ================= IMPORT =================
  function openImportModal() {
    showImportModal = true;
  }

  function closeImportModal() {
    showImportModal = false;
    importText = "";
  }

  function handleImport() {
    try {
      let data = importText.trim();

      if (
        (data.startsWith("'") && data.endsWith("'")) ||
        (data.startsWith('"') && data.endsWith('"'))
      ) {
        data = JSON.parse(data);
      }

      const parsed = JSON.parse(data);

      if (!Array.isArray(parsed)) {
        throw new Error("Expected array");
      }

      importedCheckpoints = parsed;
      draw();
      closeImportModal();
      // wait for DOM update so viewportEl is valid
      requestAnimationFrame(() => {
        fitCameraToCheckpoints(importedCheckpoints);
      });

    } catch (err) {
      console.error(err);
      alert("Invalid checkpoint data");
    }
  }

  // ================= IMPORT PATH =================
  function openImportPathModal() {
    showImportPathModal = true;
  }

  function closeImportPathModal() {
    showImportPathModal = false;
    importPathText = "";
  }

  function handleImportPath() {
    try {
      let data = importPathText.trim();

      if (
        (data.startsWith("'") && data.endsWith("'")) ||
        (data.startsWith('"') && data.endsWith('"'))
      ) {
        data = JSON.parse(data);
      }

      const parsed = JSON.parse(data);

      if (!Array.isArray(parsed)) {
        throw new Error("Expected array");
      }

      const converted = parsed.map((p) => gtaToMap(p.x, p.y));

      pushUndo();
      pathPoints = converted;
      isDrawing = converted.length > 0;
      draw();
      closeImportPathModal();
      // wait for DOM update so viewportEl is valid
      requestAnimationFrame(() => {
        fitCameraToPath(pathPoints);
      });

    } catch (err) {
      console.error(err);
      alert("Invalid path data");
    }
  }

  // ================= EXPORT =================
  function openExportModal() {
    const exportedPath = pathPoints.map((p) => {
      const gta = mapToGta(p.x, p.y);
      return { x: gta.x, y: gta.y, z: 0 };
    });

    exportText = JSON.stringify(exportedPath);
    showExportModal = true;
  }

  function closeExportModal() {
    showExportModal = false;
  }

  function copyExportText() {
    navigator.clipboard.writeText(exportText);
  }

  // ================= HISTORY =================
  let undoStack = [];
  let redoStack = [];

  function pushUndo() {
    undoStack = [...undoStack, pathPoints];
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;

    const previous = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    redoStack = [...redoStack, pathPoints];

    pathPoints = previous;
    isDrawing = pathPoints.length > 0;
    draw();
  }

  function redo() {
    if (redoStack.length === 0) return;

    const next = redoStack[redoStack.length - 1];
    redoStack = redoStack.slice(0, -1);
    undoStack = [...undoStack, pathPoints];

    pathPoints = next;
    isDrawing = pathPoints.length > 0;
    draw();
  }

  function clearPath() {
    if (pathPoints.length === 0) return;

    pushUndo();
    pathPoints = [];
    isDrawing = false;
    draw();
  }

  function openClearConfirm() {
    if (pathPoints.length === 0) return;
    showClearConfirm = true;
  }

  function closeClearConfirm() {
    showClearConfirm = false;
  }

  function confirmClearPath() {
    clearPath();
    showClearConfirm = false;
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      if (pickingIndex !== null) cancelPicking();
      else if (showImportModal) closeImportModal();
      else if (showImportPathModal) closeImportPathModal();
      else if (showExportModal) closeExportModal();
      else if (showClearConfirm) closeClearConfirm();
      else if (showCalibrateModal) closeCalibrateModal();
      return;
    }

    const tag = e.target.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;

    const key = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === "z") {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (key === "y" || (e.shiftKey && key === "z"))) {
      e.preventDefault();
      redo();
    }
  }

  // ================= CAMERA =================
  function animateCameraTo(targetPos, targetScale) {
    const startPos = { ...pos };
    const startScale = scale;

    let t = 0;

    function step() {
      t += 0.05;

      const ease = t > 1 ? 1 : t;

      scale = startScale + (targetScale - startScale) * ease;
      pos.x = startPos.x + (targetPos.x - startPos.x) * ease;
      pos.y = startPos.y + (targetPos.y - startPos.y) * ease;

      if (t < 1) requestAnimationFrame(step);
      draw();
    }

    step();
  }

  function screenToWorld(e) {
    const rect = viewportEl.getBoundingClientRect();

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    return {
      x: (screenX - pos.x) / scale,
      y: (screenY - pos.y) / scale
    };
  }

  function handleMouseMove(e) {
    const world = screenToWorld(e);
    worldMouse = world;

    // =====================
    // MOVE TOOL (highest priority)
    // =====================
    if (activeTool === "move" && isMovingPoint && selectedPointIndex !== null) {
      const updated = [...pathPoints];
      updated[selectedPointIndex] = { x: world.x, y: world.y };
      pathPoints = updated;

      requestDraw();
      return;
    }

    // =====================
    // PAN CAMERA (only if NOT interacting with tool)
    // =====================
    if (dragging) {
      pos.x += e.clientX - last.x;
      pos.y += e.clientY - last.y;

      last = { x: e.clientX, y: e.clientY };

      requestDraw();
      return;
    }

    // =====================
    // DEFAULT REDRAW (hover preview etc)
    // =====================
    requestDraw();
  }

  function handleMouseDown(e) {
    // ===== PAN =====
    if (e.button === 1) {
      e.preventDefault();
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
      return;
    }

    // ===== LEFT CLICK =====
    if (e.button === 0) {
      e.preventDefault();

      // =====================
      // CALIBRATION PICKING (takes priority over any tool)
      // =====================
      if (pickingIndex !== null) {
        const world = screenToWorld(e);

        const updated = [...calibrationPoints];
        updated[pickingIndex] = { ...updated[pickingIndex], map: world };
        calibrationPoints = updated;

        pickingIndex = null;
        showCalibrateModal = true;
        draw();
        return;
      }

      // =====================
      // PAN TOOL
      // =====================
      if (activeTool === "none") {
        dragging = true;
        last = { x: e.clientX, y: e.clientY };
        return;
      }

      const world = screenToWorld(e);

      // =====================
      // MOVE TOOL
      // =====================
      if (activeTool === "move") {
        const idx = getNearestPoint(world);

        if (idx !== null) {
          pushUndo();
          selectedPointIndex = idx;
          isMovingPoint = true;
          return;
        }

        // not near an existing point - check if the click landed on a
        // segment, and if so insert a new point there (grabbed for dragging)
        const segIdx = getNearestSegment(world);

        if (segIdx !== null) {
          pushUndo();

          const insertIndex = segIdx + 1;
          const updated = [...pathPoints];
          updated.splice(insertIndex, 0, world);
          pathPoints = updated;

          selectedPointIndex = insertIndex;
          isMovingPoint = true;
          draw();
        }

        return;
      }

      // =====================
      // PEN TOOL
      // =====================
      if (activeTool === "pen") {
        pushUndo();

        if (!isDrawing) {
          pathPoints = [world];
          isDrawing = true;
        } else {
          pathPoints = [...pathPoints, world];
        }

        draw();
        return;
      }
    }

    // ===== RIGHT CLICK =====
    if (e.button === 2) {
      e.preventDefault();

      if (activeTool === "pen") {
        if (pathPoints.length === 0) return;

        pushUndo();
        pathPoints = pathPoints.slice(0, -1);

        if (pathPoints.length === 0) {
          isDrawing = false;
        }

        draw();
        return;
      }

      if (activeTool === "move") {
        const world = screenToWorld(e);
        const idx = getNearestPoint(world);

        if (idx === null) return;

        pushUndo();
        pathPoints = pathPoints.filter((_, i) => i !== idx);
        selectedPointIndex = null;
        isMovingPoint = false;

        if (pathPoints.length === 0) {
          isDrawing = false;
        }

        draw();
      }
    }
  }

  function handleMouseUp(e) {
    if (e.button === 1) dragging = false;

    if (e.button === 0) {
      dragging = false;
      isMovingPoint = false;
      selectedPointIndex = null;
    }
  }

  function handleWheel(e) {
    e.preventDefault();

    const rect = viewportEl.getBoundingClientRect();

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - pos.x) / scale;
    const worldY = (mouseY - pos.y) / scale;

    const zoomFactor = 1.1;

    scale = e.deltaY < 0
      ? scale * zoomFactor
      : scale / zoomFactor;

    scale = Math.max(minScale, Math.min(maxScale, scale));

    pos.x = mouseX - worldX * scale;
    pos.y = mouseY - worldY * scale;
    requestDraw();
  }

  // ================= MAP =================
  function changeMap(key) {
    const option = mapOptions.find((m) => m.key === key);
    if (option) {
      currentMap = option.src;
      loadMapMeta(option.src);
    }
    showMapMenu = false;
  }

  function toggleMapMenu() {
    showMapMenu = !showMapMenu;
  }

  function triggerCustomMapUpload() {
    customMapInputEl?.click();
  }

  function handleCustomMapFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const src = URL.createObjectURL(file);
    const key = `custom-${Date.now()}`;
    const label = file.name.replace(/\.[^/.]+$/, "");

    mapOptions = [...mapOptions, { key, label, src, custom: true }];
    changeMap(key);

    // a freshly uploaded map has no known calibration yet, so prompt for one
    openCalibrateModal();
  }

  function removeCustomMap(key) {
    const option = mapOptions.find((m) => m.key === key);
    if (!option) return;

    if (currentMap === option.src) {
      changeMap(mapOptions[0].key === key ? mapOptions[1].key : mapOptions[0].key);
    }

    URL.revokeObjectURL(option.src);
    mapOptions = mapOptions.filter((m) => m.key !== key);
  }

  async function preloadImages() {
    for (const { src } of mapOptions) {
      const img = new Image();
      img.src = src;
    }
  }

  // reads the map image's natural size (so non-square custom uploads render
  // undistorted) and samples its outer border for the edge-fill color
  function loadMapMeta(src) {
    const img = new Image();

    img.onload = () => {
      mapWidth = img.naturalWidth;
      mapHeight = img.naturalHeight;

      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const sampleCtx = canvas.getContext("2d");
      sampleCtx.drawImage(img, 0, 0, size, size);

      const points = [
        [0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1],
        [Math.floor(size / 2), 0], [Math.floor(size / 2), size - 1],
        [0, Math.floor(size / 2)], [size - 1, Math.floor(size / 2)]
      ];

      let r = 0, g = 0, b = 0;

      for (const [x, y] of points) {
        const [pr, pg, pb] = sampleCtx.getImageData(x, y, 1, 1).data;
        r += pr;
        g += pg;
        b += pb;
      }

      r = Math.round(r / points.length);
      g = Math.round(g / points.length);
      b = Math.round(b / points.length);

      edgeColor = `rgb(${r}, ${g}, ${b})`;
    };

    img.src = src;
  }

  function getCheckpointRender(cp) {
    const left = gtaToMap(cp.offset.left.x, cp.offset.left.y);
    const right = gtaToMap(cp.offset.right.x, cp.offset.right.y);

    const cx = (left.x + right.x) / 2;
    const cy = (left.y + right.y) / 2;

    let fx = right.x - left.x;
    let fy = right.y - left.y;

    const len = Math.sqrt(fx * fx + fy * fy);

    if (len > 0) {
      fx /= len;
      fy /= len;
    }

    // 90° counter-clockwise rotation
    const tx = fy;
    const ty = -fx;

    fx = tx;
    fy = ty;

    const size = 15;

    return {
      left,
      right,
      cx,
      cy,
      fx,
      fy,
      size
    };
  }

  function getCheckpointBounds(checkpoints) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const cp of checkpoints) {
      const l = gtaToMap(cp.offset.left.x, cp.offset.left.y);
      const r = gtaToMap(cp.offset.right.x, cp.offset.right.y);

      minX = Math.min(minX, l.x, r.x);
      minY = Math.min(minY, l.y, r.y);
      maxX = Math.max(maxX, l.x, r.x);
      maxY = Math.max(maxY, l.y, r.y);
    }

    return { minX, minY, maxX, maxY };
  }

  function getPointBounds(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY };
  }

  function fitCameraToBounds(bounds) {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    const rect = viewportEl.getBoundingClientRect();

    const scaleX = rect.width / (width + 200);  // padding
    const scaleY = rect.height / (height + 200);

    const targetScale = Math.max(0.1, Math.min(scaleX, scaleY));

    animateCameraTo(
      { x: rect.width / 2 - centerX * targetScale,
        y: rect.height / 2 - centerY * targetScale },
      targetScale
    );
  }

  function fitCameraToCheckpoints(checkpoints) {
    fitCameraToBounds(getCheckpointBounds(checkpoints));
  }

  function fitCameraToPath(points) {
    fitCameraToBounds(getPointBounds(points));
  }

  function fitView() {
    const points = [...pathPoints];

    for (const cp of importedCheckpoints) {
      points.push(gtaToMap(cp.offset.left.x, cp.offset.left.y));
      points.push(gtaToMap(cp.offset.right.x, cp.offset.right.y));
    }

    if (points.length === 0) return;

    fitCameraToBounds(getPointBounds(points));
  }

  function zoomBy(factor) {
    const rect = viewportEl.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const worldX = (centerX - pos.x) / scale;
    const worldY = (centerY - pos.y) / scale;

    scale = Math.max(minScale, Math.min(maxScale, scale * factor));

    pos.x = centerX - worldX * scale;
    pos.y = centerY - worldY * scale;
    draw();
  }

  function zoomIn() {
    zoomBy(1.3);
  }

  function zoomOut() {
    zoomBy(1 / 1.3);
  }

  // ================= CALIBRATION =================
  let transform = {
    scaleX: 0.6590671228952449,
    scaleY: -0.658272646765583,
    offsetX: 3756.736928841363,
    offsetY: 5522.848897438337
  };

  function gtaToMap(x, y) {
    return {
      x: x * transform.scaleX + transform.offsetX,
      y: y * transform.scaleY + transform.offsetY
    };
  }

  function mapToGta(x, y) {
    return {
      x: (x - transform.offsetX) / transform.scaleX,
      y: (y - transform.offsetY) / transform.scaleY
    };
  }

  function makeCalibrationPoint() {
    return { gta: { x: null, y: null, z: null }, map: null };
  }

  let showCalibrateModal = false;
  let showAdvancedCalibration = false;
  let pickingIndex = null;

  let calibrationPoints = [
    makeCalibrationPoint(),
    makeCalibrationPoint(),
    makeCalibrationPoint()
  ];

  function openCalibrateModal() {
    showCalibrateModal = true;
  }

  function closeCalibrateModal() {
    showCalibrateModal = false;
  }

  function startPicking(index) {
    pickingIndex = index;
    showCalibrateModal = false;
  }

  function cancelPicking() {
    pickingIndex = null;
    showCalibrateModal = true;
  }

  // simple least-squares line fit: b = m*a + n
  function fitLine(pairs) {
    const n = pairs.length;
    let sumA = 0, sumB = 0, sumAB = 0, sumAA = 0;

    for (const [a, b] of pairs) {
      sumA += a;
      sumB += b;
      sumAB += a * b;
      sumAA += a * a;
    }

    const denom = n * sumAA - sumA * sumA;
    if (Math.abs(denom) < 1e-6) return null;

    const m = (n * sumAB - sumA * sumB) / denom;
    const b = (sumB - m * sumA) / n;

    return { m, b };
  }

  function isCalibrationPointReady(p) {
    return p.map !== null && Number.isFinite(p.gta.x) && Number.isFinite(p.gta.y);
  }

  function applyCalibration() {
    if (!calibrationPoints.every(isCalibrationPointReady)) {
      alert("Fill in X/Y for all 3 points and pick a matching map location for each.");
      return;
    }

    const fitX = fitLine(calibrationPoints.map((p) => [p.gta.x, p.map.x]));
    const fitY = fitLine(calibrationPoints.map((p) => [p.gta.y, p.map.y]));

    if (!fitX || !fitY) {
      alert("These points are too close together on one axis - spread them further apart across the map.");
      return;
    }

    transform = {
      scaleX: fitX.m,
      offsetX: fitX.b,
      scaleY: fitY.m,
      offsetY: fitY.b
    };

    draw();
    closeCalibrateModal();
  }

  // coalesces bursts of draw requests (e.g. many mousemove events within
  // the same frame) into at most one actual draw per animation frame
  let drawScheduled = false;

  function requestDraw() {
    if (drawScheduled) return;
    drawScheduled = true;

    requestAnimationFrame(() => {
      drawScheduled = false;
      draw();
    });
  }

  function draw() {
    if (!ctx) return;

    ctx.clearRect(0, 0, mapWidth, mapHeight);

    // checkpoints
    importedCheckpoints.forEach((cp, i) => {
      drawCheckpoint(cp, i);
    });

    // path drawing
    drawPath();

    // move-tool hover feedback
    drawMoveHover();

    // calibration pins
    drawCalibrationPins();
  }

  function drawPath() {
    if (pathPoints.length === 0) return;

    ctx.strokeStyle = hueToColor(lineHue);
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(pathPoints[0].x, pathPoints[0].y);

    // draw confirmed segments
    for (let i = 1; i < pathPoints.length; i++) {
      ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
    }

    // live preview segment
    if (isDrawing && pathPoints.length > 0 && pickingIndex === null) {
      if (activeTool == "pen") {
        ctx.lineTo(worldMouse.x, worldMouse.y);
      }
    }

    ctx.stroke();

    // draw points
    for (const p of pathPoints) {
      ctx.fillStyle = oppositeColor(lineHue);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // optional: draw preview point
    if (isDrawing && pickingIndex === null) {
      if (activeTool == "pen") {
        ctx.fillStyle = oppositeColor(lineHue);
        ctx.beginPath();
        ctx.arc(worldMouse.x, worldMouse.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // shows what a click would do with the move tool, before it happens:
  // a ring around a point that's about to be grabbed, or a ghost point
  // where a new one would be inserted on a segment
  function drawMoveHover() {
    if (activeTool !== "move" || isMovingPoint || pickingIndex !== null) return;

    const idx = getNearestPoint(worldMouse);

    if (idx !== null) {
      const p = pathPoints[idx];

      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = "#f2b632";
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    const segIdx = getNearestSegment(worldMouse);

    if (segIdx !== null) {
      ctx.beginPath();
      ctx.arc(worldMouse.x, worldMouse.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(242, 182, 50, 0.4)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(242, 182, 50, 0.9)";
      ctx.stroke();
    }
  }

  // numbered pins for calibration points that have a map location picked,
  // only shown while the calibration modal/picking flow is active
  function drawCalibrationPins() {
    if (!showCalibrateModal && pickingIndex === null) return;

    calibrationPoints.forEach((p, i) => {
      if (!p.map) return;

      ctx.beginPath();
      ctx.arc(p.map.x, p.map.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      drawText(i + 1, p.map.x, p.map.y - 18);
    });
  }

  function drawCheckpoint(cp, i) {
    const r = getCheckpointRender(cp);

    // gate
    ctx.strokeStyle = hueToColor(checkpointHue);
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(r.left.x, r.left.y);
    ctx.lineTo(r.right.x, r.right.y);
    ctx.stroke();

    // points
    drawCircle(r.left.x, r.left.y, 4.8);
    drawCircle(r.right.x, r.right.y, 4.8);

    // arrow
    drawArrow(
      r.cx,
      r.cy,
      r.cx + r.fx * r.size,
      r.cy + r.fy * r.size
    );

    // label
    drawText(i + 1, r.cx, r.cy + 35);
  }

  function drawCircle(x, y, r) {
    ctx.fillStyle = hueToColor(checkpointHue);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawArrow(x1, y1, x2, y2) {
    const head = 10;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);

    ctx.strokeStyle = oppositeColor(checkpointHue);
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - head * Math.cos(angle - Math.PI / 6),
      y2 - head * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - head * Math.cos(angle + Math.PI / 6),
      y2 - head * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = oppositeColor(checkpointHue);
    ctx.fill();
  }

  function drawText(text, x, y) {
    ctx.font = "700 15px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";

    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.strokeText(text, x, y);

    ctx.fillStyle = "#eafff2";
    ctx.fillText(text, x, y);
  }

  function toggleColorMenu() {
    showColorMenu = !showColorMenu;
  }

  function getNearestPoint(world, radius = 12) {
    let bestIndex = null;
    let bestDist = radius;

    for (let i = 0; i < pathPoints.length; i++) {
      const p = pathPoints[i];

      const dx = p.x - world.x;
      const dy = p.y - world.y;

      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    }

    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = a.x + t * dx;
    const closestY = a.y + t * dy;

    return Math.sqrt((p.x - closestX) ** 2 + (p.y - closestY) ** 2);
  }

  // returns the index of the segment (pathPoints[i] -> pathPoints[i+1])
  // nearest to `world`, so a new point can be inserted right after it
  function getNearestSegment(world, radius = 12) {
    let bestIndex = null;
    let bestDist = radius;

    for (let i = 0; i < pathPoints.length - 1; i++) {
      const dist = distanceToSegment(world, pathPoints[i], pathPoints[i + 1]);

      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    return bestIndex;
  }
</script>

<div class="shell">

  <!-- ===== MODALS ===== -->
  {#if showImportModal}
    <div class="modal-backdrop" on:click={closeImportModal}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <i class="fa-solid fa-file-import"></i>
          <h3>Import Checkpoints</h3>
        </div>

        <textarea bind:value={importText} placeholder="Paste checkpoint JSON here..."></textarea>

        <div class="modal-actions">
          <button class="btn btn-primary" on:click={handleImport}>
            <i class="fa-solid fa-check"></i> Import
          </button>
          <button class="btn btn-ghost" on:click={closeImportModal}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showImportPathModal}
    <div class="modal-backdrop" on:click={closeImportPathModal}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <i class="fa-solid fa-route"></i>
          <h3>Import Path</h3>
        </div>

        <textarea bind:value={importPathText} placeholder="Paste path JSON here..."></textarea>

        <div class="modal-actions">
          <button class="btn btn-primary" on:click={handleImportPath}>
            <i class="fa-solid fa-check"></i> Import
          </button>
          <button class="btn btn-ghost" on:click={closeImportPathModal}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showExportModal}
    <div class="modal-backdrop" on:click={closeExportModal}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <i class="fa-solid fa-file-export"></i>
          <h3>Export Path</h3>
        </div>

        <textarea readonly value={exportText}></textarea>

        <div class="modal-actions">
          <button class="btn btn-primary" on:click={copyExportText}>
            <i class="fa-solid fa-clipboard"></i> Copy
          </button>
          <button class="btn btn-ghost" on:click={closeExportModal}>Close</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showClearConfirm}
    <div class="modal-backdrop" on:click={closeClearConfirm}>
      <div class="modal modal-sm" on:click|stopPropagation>
        <div class="modal-header modal-header-danger">
          <i class="fa-solid fa-trash"></i>
          <h3>Clear Path</h3>
        </div>

        <p class="modal-message">
          This removes all {pathPoints.length} point{pathPoints.length === 1 ? "" : "s"} on the
          current path. You can undo this afterward if you change your mind.
        </p>

        <div class="modal-actions">
          <button class="btn btn-danger-solid" on:click={confirmClearPath}>
            <i class="fa-solid fa-trash"></i> Clear
          </button>
          <button class="btn btn-ghost" on:click={closeClearConfirm}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showCalibrateModal}
    <div class="modal-backdrop" on:click={closeCalibrateModal}>
      <div class="modal modal-lg" on:click|stopPropagation>
        <div class="modal-header">
          <i class="fa-solid fa-sliders"></i>
          <h3>Calibrate Coordinates</h3>
        </div>

        <p class="modal-message">
          Enter the in-game coordinate for 3 known locations, then pick the matching spot on the
          map for each. Spread them far apart across the map for the most accurate result.
        </p>

        <div class="calib-rows">
          {#each calibrationPoints as point, i}
            <div class="calib-row">
              <div class="calib-row-header">
                <span class="calib-row-title">Point {i + 1}</span>
                <span class="calib-row-status" class:ready={point.map !== null}>
                  {point.map ? `Map (${Math.round(point.map.x)}, ${Math.round(point.map.y)})` : "Map location not set"}
                </span>
              </div>

              <div class="calib-row-fields">
                <label class="calib-field">
                  <span>X</span>
                  <input type="number" step="any" bind:value={point.gta.x} />
                </label>
                <label class="calib-field">
                  <span>Y</span>
                  <input type="number" step="any" bind:value={point.gta.y} />
                </label>
                <label class="calib-field">
                  <span>Z</span>
                  <input type="number" step="any" bind:value={point.gta.z} />
                </label>

                <button class="btn calib-pick-btn" on:click={() => startPicking(i)}>
                  <i class="fa-solid fa-map-pin"></i>
                  {point.map ? "Re-pick" : "Pick on Map"}
                </button>
              </div>
            </div>
          {/each}
        </div>

        <button
          class="calib-advanced-toggle"
          on:click={() => showAdvancedCalibration = !showAdvancedCalibration}
        >
          <i class="fa-solid {showAdvancedCalibration ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
          Advanced
        </button>

        {#if showAdvancedCalibration}
          <div class="calib-advanced">
            <label class="calib-field">
              <span>X Scale</span>
              <input type="number" step="any" bind:value={transform.scaleX} on:input={draw} />
            </label>
            <label class="calib-field">
              <span>Y Scale</span>
              <input type="number" step="any" bind:value={transform.scaleY} on:input={draw} />
            </label>
            <label class="calib-field">
              <span>X Offset</span>
              <input type="number" step="any" bind:value={transform.offsetX} on:input={draw} />
            </label>
            <label class="calib-field">
              <span>Y Offset</span>
              <input type="number" step="any" bind:value={transform.offsetY} on:input={draw} />
            </label>
          </div>
        {/if}

        <div class="modal-actions">
          <button
            class="btn btn-primary"
            on:click={applyCalibration}
            disabled={!calibrationPoints.every(isCalibrationPointReady)}
          >
            <i class="fa-solid fa-check"></i> Calibrate
          </button>
          <button class="btn btn-ghost" on:click={closeCalibrateModal}>Close</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ===== TOP BAR ===== -->
  <header class="topbar">
    <div class="brand">
      <div class="brand-icon"><i class="fa-solid fa-route"></i></div>
      <div class="brand-text">
        <h1>GPS Editor</h1>
        <p>Custom Routing Tool</p>
      </div>
    </div>
  </header>

  <div class="workspace">

    <!-- ===== MAP ===== -->
    <div class="map-container" style="background: {edgeColor};">

      <div class="tool-dock">

        <div class="toolbar">

          <button
            class="tool-btn"
            class:active={activeTool === "none"}
            title="Pan"
            on:click={() => activeTool = "none"}
          >
            <i class="fa-solid fa-hand"></i>
          </button>

          <button
            class="tool-btn"
            class:active={activeTool === "pen"}
            title="Draw path"
            on:click={() => activeTool = "pen"}
          >
            <i class="fa-solid fa-pen"></i>
          </button>

          <button
            class="tool-btn"
            class:active={activeTool === "move"}
            title="Move points"
            on:click={() => activeTool = "move"}
          >
            <i class="fa-solid fa-arrows-up-down-left-right"></i>
          </button>

        </div>

        <div class="legend-bar">
          {#each toolLegend[activeTool] as item}
            <div class="legend-item">
              <svg class="legend-icon" viewBox="0 0 20 26" width="16" height="21" fill="none">
                <rect x="2" y="1" width="16" height="24" rx="8" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
                <line x1="10" y1="1" x2="10" y2="11" stroke="currentColor" stroke-width="1.4" opacity="0.5" />

                {#if item.icon === "left"}
                  <rect x="3" y="2" width="6" height="8" rx="3" fill="currentColor" />
                  <rect x="8" y="5" width="4" height="7" rx="2" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
                {:else if item.icon === "right"}
                  <rect x="11" y="2" width="6" height="8" rx="3" fill="currentColor" />
                  <rect x="8" y="5" width="4" height="7" rx="2" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
                {:else if item.icon === "middle"}
                  <rect x="8" y="5" width="4" height="7" rx="2" fill="currentColor" />
                {:else if item.icon === "scroll"}
                  <rect x="8" y="5" width="4" height="7" rx="2" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
                  <path d="M9 7 L10 6 L11 7" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M9 10 L10 11 L11 10" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                {/if}
              </svg>
              <span>{item.label}</span>
            </div>
          {/each}
        </div>

      </div>

      <div class="hud-coords">
        <div class="hud-row">
          <span class="hud-tag">Map</span>
          <span class="hud-axis">X</span><span class="hud-value">{Math.round(worldMouse.x)}</span>
          <span class="hud-axis">Y</span><span class="hud-value">{Math.round(worldMouse.y)}</span>
        </div>

        <div class="hud-row">
          <span class="hud-tag">GTA</span>
          <span class="hud-axis">X</span><span class="hud-value">{Math.round(mapToGta(worldMouse.x, worldMouse.y).x)}</span>
          <span class="hud-axis">Y</span><span class="hud-value">{Math.round(mapToGta(worldMouse.x, worldMouse.y).y)}</span>
        </div>

        <button class="hud-calibrate-btn" on:click={openCalibrateModal}>
          <i class="fa-solid fa-sliders"></i> Calibrate
        </button>
      </div>

      {#if pickingIndex !== null}
        <div class="calibrate-banner">
          <i class="fa-solid fa-map-pin"></i>
          <span>Click the map to set Point {pickingIndex + 1}</span>
          <button class="calibrate-banner-cancel" on:click={cancelPicking}>Cancel</button>
        </div>
      {/if}

      <!-- MAP MENU -->
      <div class="map-overlay">

        <div class="map-overlay-row">
          <button class="icon-btn" title="Change map" on:click={toggleMapMenu}>
            <i class="fa-solid fa-layer-group"></i>
          </button>

          <button class="icon-btn" title="Colors" on:click={toggleColorMenu}>
            <i class="fa-solid fa-palette"></i>
          </button>

          <button
            class="icon-btn"
            title="Fit view"
            on:click={fitView}
            disabled={pathPoints.length === 0 && importedCheckpoints.length === 0}
          >
            <i class="fa-solid fa-crosshairs"></i>
          </button>

          <button class="icon-btn" title="Zoom in" on:click={zoomIn} disabled={scale >= maxScale}>
            <i class="fa-solid fa-magnifying-glass-plus"></i>
          </button>

          <button class="icon-btn" title="Zoom out" on:click={zoomOut} disabled={scale <= minScale}>
            <i class="fa-solid fa-magnifying-glass-minus"></i>
          </button>
        </div>

        {#if showMapMenu}
          <div class="dropdown-card">
            {#each mapOptions as opt}
              <div
                class="dropdown-option"
                class:active={currentMap === opt.src}
                on:click={() => changeMap(opt.key)}
              >
                <span class="dropdown-option-label">{opt.label}</span>
                {#if opt.custom}
                  <button
                    class="dropdown-option-remove"
                    title="Remove map"
                    on:click|stopPropagation={() => removeCustomMap(opt.key)}
                  >
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                {/if}
              </div>
            {/each}

            <div class="dropdown-divider"></div>

            <div class="dropdown-option" on:click={triggerCustomMapUpload}>
              <span class="dropdown-option-label">
                <i class="fa-solid fa-upload"></i>
                Upload Map
              </span>
            </div>
          </div>
        {/if}

        <input
          type="file"
          accept="image/*"
          bind:this={customMapInputEl}
          on:change={handleCustomMapFile}
          style="display:none"
        />

        {#if showColorMenu}
          <div class="dropdown-card color-menu">

            <!-- ===== CHECKPOINTS ===== -->
            <div class="color-section">
              <div class="color-title">Checkpoints</div>

              <input
                type="range"
                min="0"
                max="360"
                class="hue-slider"
                bind:value={checkpointHue}
                on:input={draw}
              />

              <div
                class="color-preview"
                style="background:{hueToColor(checkpointHue)}"
              />
            </div>

            <!-- ===== LINE ===== -->
            <div class="color-section">
              <div class="color-title">Line</div>

              <input
                type="range"
                min="0"
                max="360"
                class="hue-slider"
                bind:value={lineHue}
                on:input={draw}
              />

              <div
                class="color-preview"
                style="background:{hueToColor(lineHue)}"
              />
            </div>

          </div>
        {/if}
      </div>

      <!-- VIEWPORT -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="viewport"
        class:picking={pickingIndex !== null}
        bind:this={viewportEl}
        data-tool={activeTool}
        on:mousemove={handleMouseMove}
        on:mousedown={handleMouseDown}
        on:mouseup={handleMouseUp}
        on:mouseleave={() => (dragging = false)}
        on:wheel|preventDefault={handleWheel}
        on:contextmenu|preventDefault
      >

        <div
          class="map-inner"
          style="transform: translate({pos.x}px, {pos.y}px) scale({scale});"
        >

          <div class="map-stage" style="width: {mapWidth}px; height: {mapHeight}px;">

            <img class="map" src={currentMap} alt="" />

            <canvas
              class="overlay"
              bind:this={canvasEl}
              width={mapWidth}
              height={mapHeight}
            />

          </div>

        </div>
      </div>
    </div>

    <!-- ===== SIDEBAR ===== -->
    <aside class="sidebar">

      <section class="panel-section">
        <h2 class="section-title">Status</h2>
        <div class="stat-grid">
          <div class="stat-tile">
            <span class="stat-label">Zoom</span>
            <span class="stat-value">{Math.round(scale * 100)}%</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Points</span>
            <span class="stat-value">{pathPoints.length}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-label">Gates</span>
            <span class="stat-value">{importedCheckpoints.length}</span>
          </div>
        </div>
      </section>

      <section class="panel-section">
        <h2 class="section-title">Edit</h2>

        <div class="btn-row">
          <button class="btn" on:click={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">
            <i class="fa-solid fa-rotate-left"></i>
            Undo
          </button>

          <button class="btn" on:click={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Y)">
            <i class="fa-solid fa-rotate-right"></i>
            Redo
          </button>
        </div>

        <button class="btn btn-panel btn-danger" on:click={openClearConfirm} disabled={pathPoints.length === 0}>
          <i class="fa-solid fa-trash"></i>
          Clear Path
        </button>
      </section>

      <section class="panel-section">
        <h2 class="section-title">Data</h2>

        <button class="btn btn-panel" on:click={openImportModal}>
          <i class="fa-solid fa-file-import"></i>
          Import Checkpoints
        </button>

        <button class="btn btn-panel" on:click={openImportPathModal}>
          <i class="fa-solid fa-route"></i>
          Import Path
        </button>

        <button class="btn btn-panel" on:click={openExportModal} disabled={pathPoints.length === 0}>
          <i class="fa-solid fa-file-export"></i>
          Export Path
        </button>
      </section>

    </aside>

  </div>

</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: var(--bg-app);
    overflow: hidden;
  }

  /* ===== TOP BAR ===== */
  .topbar {
    flex-shrink: 0;
    height: 56px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    position: relative;
  }

  .topbar::after {
    content: "";
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent-border), transparent);
    opacity: 0.6;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-icon {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-sm);
    color: var(--accent);
    font-size: 13px;
  }

  .brand-text h1 {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.1px;
  }

  .brand-text p {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint);
    margin-top: 1px;
  }

  /* ===== WORKSPACE ===== */
  .workspace {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* ===== MAP ===== */
  .map-container {
    flex: 1;
    background: var(--bg-inset);
    position: relative;
    overflow: hidden;
  }

  .map-container::before,
  .map-container::after {
    content: "";
    position: absolute;
    width: 18px;
    height: 18px;
    z-index: 15;
    pointer-events: none;
    opacity: 0.35;
  }

  .map-container::before {
    top: 14px;
    left: 14px;
    border-top: 1.5px solid var(--accent);
    border-left: 1.5px solid var(--accent);
  }

  .map-container::after {
    bottom: 14px;
    right: 14px;
    border-bottom: 1.5px solid var(--accent);
    border-right: 1.5px solid var(--accent);
  }

  .viewport {
    width: 100%;
    height: 100%;
  }

  .viewport[data-tool="none"] {
    cursor: grab;
  }

  .viewport[data-tool="none"]:active {
    cursor: grabbing;
  }

  .viewport[data-tool="pen"],
  .viewport[data-tool="move"] {
    cursor: crosshair;
  }

  .viewport.picking {
    cursor: crosshair;
  }

  .map-inner {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }

  .map-stage {
    position: relative;
  }

  .map,
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .overlay {
    pointer-events: none;
  }

  /* ===== TOOLBAR ===== */
  .tool-dock {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 20;
  }

  .toolbar {
    display: flex;
    gap: 4px;

    background: var(--bg-panel);
    border: 1px solid var(--border);
    padding: 6px;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-soft);
  }

  .legend-bar {
    display: flex;
    align-items: center;
    gap: 14px;

    background: var(--bg-panel);
    border: 1px solid var(--border);
    padding: 7px 14px;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-soft);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-dim);
    font-size: 11px;
    white-space: nowrap;
  }

  .legend-icon {
    flex-shrink: 0;
  }

  .tool-btn {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;

    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);

    color: var(--text-dim);
    font-size: 14px;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .tool-btn:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.04);
  }

  .tool-btn.active {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: var(--accent-border);
  }

  /* ===== HUD ===== */
  .hud-coords {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 15;

    display: flex;
    flex-direction: column;
    gap: 6px;

    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.3px;
    box-shadow: var(--shadow-soft);
  }

  .hud-row {
    display: flex;
    align-items: baseline;
    gap: 0;
  }

  .hud-tag {
    color: var(--text-faint);
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.5px;
    margin-right: 8px;
    width: 26px;
  }

  .hud-axis {
    color: var(--text-faint);
    margin-right: 4px;
  }

  .hud-value {
    color: var(--accent);
    font-weight: 600;
    margin-right: 8px;
  }

  .hud-value:last-child {
    margin-right: 0;
  }

  .hud-calibrate-btn {
    margin-top: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-dim);
    font-family: var(--font-sans);
    font-size: 11px;
    padding: 6px 8px;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .hud-calibrate-btn:hover {
    color: var(--accent);
    border-color: var(--accent-border);
    background: var(--accent-soft);
  }

  .calibrate-banner {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 25;

    display: flex;
    align-items: center;
    gap: 10px;

    background: var(--bg-panel);
    border: 1px solid var(--accent-border);
    color: var(--text);
    padding: 8px 14px;
    border-radius: var(--radius-md);
    font-size: 12px;
    box-shadow: var(--shadow-soft);
  }

  .calibrate-banner-cancel {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-dim);
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }

  .calibrate-banner-cancel:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }

  /* ===== MAP MENU ===== */
  .map-overlay {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 15;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .map-overlay-row {
    display: flex;
    flex-direction: row;
    gap: 6px;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;

    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-dim);
    cursor: pointer;
    box-shadow: var(--shadow-soft);
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .icon-btn:hover {
    color: var(--accent);
    border-color: var(--accent-border);
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .icon-btn:disabled:hover {
    color: var(--text-dim);
    border-color: var(--border);
  }

  .dropdown-card {
    margin-top: 4px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    min-width: 130px;
    box-shadow: var(--shadow-soft);
  }

  .dropdown-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 12px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .dropdown-option:hover {
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
  }

  .dropdown-option.active {
    color: var(--accent);
  }

  .dropdown-option-label {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-option-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 4px;
    color: var(--text-dim);
    cursor: pointer;
  }

  .dropdown-option-remove:hover {
    color: var(--danger);
  }

  .dropdown-divider {
    height: 1px;
    margin: 4px 0;
    background: var(--border);
  }

  .color-menu {
    width: 190px;
    padding: 12px;
  }

  .color-section + .color-section {
    margin-top: 14px;
  }

  .color-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-faint);
    margin-bottom: 8px;
  }

  .hue-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      hsl(0, 100%, 55%), hsl(60, 100%, 55%), hsl(120, 100%, 55%),
      hsl(180, 100%, 55%), hsl(240, 100%, 55%), hsl(300, 100%, 55%), hsl(360, 100%, 55%)
    );
    outline: none;
    cursor: pointer;
  }

  .hue-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid var(--bg-app);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    cursor: pointer;
  }

  .hue-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid var(--bg-app);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    cursor: pointer;
  }

  .color-preview {
    width: 100%;
    height: 8px;
    border-radius: 4px;
    margin-top: 8px;
  }

  /* ===== SIDEBAR ===== */
  .sidebar {
    width: 300px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;

    background: var(--bg-panel-alt);
    border-left: 1px solid var(--border);
    padding: 20px;
    color: var(--text);
    overflow-y: auto;
  }

  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-faint);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
  }

  .stat-tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px;
  }

  .stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-faint);
  }

  .stat-value {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  /* ===== BUTTONS ===== */
  .btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    padding: 10px 12px;
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .btn:hover {
    border-color: var(--border-strong);
    background: rgba(255, 255, 255, 0.04);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn:disabled:hover {
    border-color: var(--border);
    background: var(--bg-inset);
  }

  .btn-panel {
    justify-content: flex-start;
  }

  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
  }

  .btn-primary:hover {
    background: var(--accent);
    color: var(--accent-ink);
    filter: brightness(1.08);
  }

  .btn-ghost {
    background: transparent;
  }

  .btn-danger-solid {
    background: var(--danger);
    border-color: var(--danger);
    color: #1a0a0a;
    font-weight: 600;
  }

  .btn-danger-solid:hover {
    background: var(--danger);
    filter: brightness(1.08);
  }

  .btn-row {
    display: flex;
    gap: 8px;
  }

  .btn-row .btn {
    width: auto;
    flex: 1;
  }

  .btn-danger:hover {
    border-color: var(--danger);
    color: var(--danger);
    background: rgba(239, 91, 91, 0.08);
  }

  /* ===== MODAL ===== */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(4, 6, 8, 0.6);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    width: 520px;
    max-width: 90%;
    background: var(--bg-panel-alt);
    border: 1px solid var(--border-strong);
    padding: 20px;
    border-radius: var(--radius-md);
    color: var(--text);
    box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.6);
  }

  .modal-sm {
    width: 380px;
  }

  .modal-lg {
    width: 640px;
  }

  .modal-message {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-dim);
  }

  .calib-rows {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 14px;
  }

  .calib-row {
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
  }

  .calib-row-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .calib-row-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .calib-row-status {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-faint);
  }

  .calib-row-status.ready {
    color: var(--accent);
  }

  .calib-row-fields {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .calib-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint);
    width: 72px;
    flex-shrink: 0;
  }

  .calib-field input {
    width: 100%;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    padding: 7px 8px;
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .calib-field input:focus {
    border-color: var(--accent-border);
  }

  .calib-pick-btn {
    width: auto;
    flex: 1;
    white-space: nowrap;
  }

  .calib-advanced-toggle {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-family: var(--font-sans);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }

  .calib-advanced-toggle:hover {
    color: var(--text);
  }

  .calib-advanced-toggle i {
    font-size: 10px;
    width: 10px;
  }

  .calib-advanced {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 10px;
  }

  .calib-advanced .calib-field {
    width: 130px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--accent);
    padding-bottom: 14px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .modal-header-danger {
    color: var(--danger);
  }

  textarea {
    width: 100%;
    height: 220px;
    background: var(--bg-inset);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-family: var(--font-mono);
    font-size: 12px;
    resize: vertical;
  }

  textarea:focus {
    border-color: var(--accent-border);
  }

  textarea::placeholder {
    color: var(--text-faint);
  }

  .modal-actions {
    margin-top: 14px;
    display: flex;
    gap: 10px;
  }
</style>
