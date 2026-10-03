(function () {
  'use strict';

  // --- GLSL Shaders ------------------------------------------------------

  const VERT = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  // Downsample pass: box-average the source into a target sized exactly to
  // the cell grid (relies on the source texture's own mipmaps for the
  // averaging - see initShader for why this only holds for image sources).
  const FRAG_DOWNSAMPLE = /* glsl */`
    precision mediump float;

    uniform sampler2D uSourceTex;
    uniform float     uContainerAspect;
    uniform float     uImageAspect;
    uniform vec2      uCells;
    uniform float     uFullFrame;

    varying vec2 vUv;

    // uFullFrame = 1 skips the cover crop: the subject-analysis pass reads
    // the WHOLE photo so detection never depends on the visitor's viewport.
    vec2 coverUv(vec2 uv) {
      if (uFullFrame > 0.5) return uv;
      float ratio = uContainerAspect / uImageAspect;
      vec2  scale = ratio > 1.0 ? vec2(1.0, 1.0 / ratio) : vec2(ratio, 1.0);
      return clamp((uv - 0.5) * scale + 0.5, 0.0, 1.0);
    }

    float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      // rgb = the cell's box average (the GPU picks a high mip here because
      // this pass renders into a target the size of the cell grid).
      vec4 avg = texture2D(uSourceTex, coverUv(vUv));

      // alpha = how DETAILED this cell is. Backgrounds are smooth, subjects
      // are not - that is the property brightness misses, and it is what
      // decides where glyphs are allowed to land.
      //
      // Four sharp taps (negative LOD bias) at the cell quadrants, compared
      // against THEIR OWN mean - not against avg above.
      //
      // Comparing against avg was wrong and it is what produced an oversized
      // clear margin above the subject. avg comes from a GPU-chosen mip that
      // blurs far wider than one cell, so beside a dark object it drags dark
      // pixels into a cell sitting in open background; the sharp taps still
      // read bright, the mismatch reads as "detail", and the gate rejects
      // empty space. Measured on the reference photo, this cost ~3.5 cells of
      // clear margin around the subject; taps-against-taps costs ~2.1.
      // (It does NOT explain a top-vs-bottom asymmetry - measurement showed
      // the old margin was equal on all four sides.)
      //
      // Measuring the taps against each other keeps the footprint inside the
      // cell. A smooth gradient reads near zero wherever it sits; knit
      // fabric, fur, grass and foliage still read high.
      vec2 q = 0.25 / uCells;
      float l0 = lum(texture2D(uSourceTex, coverUv(vUv + vec2( q.x,  q.y)), -3.0).rgb);
      float l1 = lum(texture2D(uSourceTex, coverUv(vUv + vec2(-q.x,  q.y)), -3.0).rgb);
      float l2 = lum(texture2D(uSourceTex, coverUv(vUv + vec2( q.x, -q.y)), -3.0).rgb);
      float l3 = lum(texture2D(uSourceTex, coverUv(vUv + vec2(-q.x, -q.y)), -3.0).rgb);
      float m  = (l0 + l1 + l2 + l3) * 0.25;
      float detail = (abs(l0 - m) + abs(l1 - m) + abs(l2 - m) + abs(l3 - m)) * 0.25;

      // Weber contrast: variance RELATIVE to local brightness, not absolute.
      // Absolute variance goes blind in the dark - laces on a near-black shoe
      // deviate by ~0.03 around a mean of ~0.08, which absolute measurement
      // reads as smooth, so the background walk climbed straight onto the
      // shoe (its colour matches the shadowed floor it stands on). Relative
      // to its own brightness that same texture reads ~0.4, unmistakably
      // busy, while a smooth dark floor stays ~0.03.
      gl_FragColor = vec4(avg.rgb, clamp(detail / (m + 0.05), 0.0, 1.0));
    }
  `;

  const FRAG_MAIN = /* glsl */`
    // highp, not mediump: the cell grid is derived from vUv * uResolution,
    // which runs past 3000 on a retina canvas. mediump loses integer
    // precision up there and floor() lands on the wrong cell, which shows
    // up as uneven, jittering cell boundaries on some GPUs.
    precision highp float;

    uniform sampler2D uSourceTex;
    uniform sampler2D uDownsampledTex;
    uniform sampler2D uPresenceTex;
    uniform sampler2D uAtlasTex;
    uniform vec2      uResolution;
    uniform vec2      uCellPx;
    uniform vec2      uCells;
    uniform float     uGlyphCount;
    uniform float     uThreshLow;
    uniform float     uThreshHigh;
    uniform float     uLumMin;
    uniform float     uLumMax;
    uniform float     uWhitening;
    uniform float     uOpacity;
    uniform float     uJitter;
    uniform float     uTime;
    uniform float     uReshuffleRate;
    uniform float     uChurn;
    uniform vec2      uWaveCenter;
    uniform float     uWaveMaxDist;
    uniform vec2      uClickCenter;
    uniform float     uClickStart;
    uniform float     uRippleSpeed;
    uniform float     uContainerAspect;
    uniform float     uImageAspect;
    uniform float     uGlyphFrac;
    uniform float     uShadeMix;
    uniform float     uDarkOpacity;
    uniform bool      uLoaded;

    varying vec2 vUv;

    vec2 coverUv(vec2 uv) {
      float ratio = uContainerAspect / uImageAspect;
      vec2  scale = ratio > 1.0 ? vec2(1.0, 1.0 / ratio) : vec2(ratio, 1.0);
      return clamp((uv - 0.5) * scale + 0.5, 0.0, 1.0);
    }

    // Hash without sine (Hoskins). The obvious fract(p.x * p.y) hash tiles
    // visibly at these cell counts - it printed a repeating motif across the
    // whole backdrop instead of noise.
    float hash21(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      if (!uLoaded) {
        gl_FragColor = vec4(0.0);
        return;
      }

      // Untouched full-res pixel - the photo itself, never blurred.
      vec4 fullRes = texture2D(uSourceTex, coverUv(vUv));

      // One box-averaged texel per cell - luminance only, prevents boil.
      vec2 pixel  = vUv * uResolution;
      vec2 cellId = floor(pixel / uCellPx);
      vec2 cellUv = (cellId + 0.5) / uCells;
      vec4 cellAvg = texture2D(uDownsampledTex, cellUv);

      float lum     = dot(cellAvg.rgb, vec3(0.2126, 0.7152, 0.0722));
      float normLum = clamp((lum - uLumMin) / max(uLumMax - uLumMin, 0.0001), 0.0, 1.0);

      // presence - a finished per-cell decision from the presence pass:
      // smooth enough, right colour, and not an isolated speckle.
      float presence = texture2D(uPresenceTex, cellUv).r;

      // Click: a typewriter front radiating from the pointer. Each cell has
      // a jittered arrival time (the frontier is ragged, not a clean ring);
      // on arrival it scrambles through glyphs at ~18Hz for a beat before
      // settling on its new character - the decode/typing feel - and its
      // opacity lifts slightly, decaying back after the front moves on.
      float band = 0.0;
      float clickOffset = 0.0;
      if (uClickStart >= 0.0) {
        float ct     = uTime - uClickStart;
        float cdist  = distance((cellId + 0.5) * uCellPx, uClickCenter * uCellPx);
        float arrive = cdist / uRippleSpeed + hash21(cellId * 1.7) * 0.14;
        float since  = ct - arrive;
        if (since > 0.0) {
          clickOffset = mod(floor(uClickStart * 97.0), 1024.0) + 11.0 + floor(min(since, 0.22) * 18.0);
          band = 0.35 * (1.0 - smoothstep(0.0, 0.6, since));
        }
      }

      // Density is UNIFORM by default: every background cell gets a glyph
      // drawn at random from the whole set, so a dark area is as dense as a
      // light one. Brightness moves to opacity instead (below). uShadeMix
      // dials back toward the old behaviour, where tone picked the glyph and
      // dark areas thinned out to dots.
      float shade = smoothstep(uThreshLow, uThreshHigh, normLum);

      // Slow reshuffle as a WAVE: each front starts at the subject's centre
      // and sweeps outward, one full frame-crossing per 1/rate seconds,
      // faster while scrolling (uChurn). A cell re-rolls its glyph the
      // moment a front passes it, so the churn reads as radiating from the
      // subject instead of random static.
      float dPx  = distance((cellId + 0.5) * uCellPx, uWaveCenter * uCellPx);
      float slot = floor(uTime * uReshuffleRate * (1.0 + uChurn * 3.0) - dPx / max(uWaveMaxDist, 1.0)) + clickOffset;
      float n    = hash21(cellId + slot * 17.0);
      float n2   = hash21(cellId.yx + slot * 31.0 + 7.0);

      float byTone = clamp(shade + (n - 0.5) * uJitter, 0.0, 0.999);
      float pick   = mix(n2, byTone, uShadeMix);
      float idx    = floor(clamp(pick, 0.0, 0.999) * uGlyphCount);

      // The glyph occupies the middle uGlyphFrac of its cell; the remainder is
      // the gap between characters.
      vec2 localUv = fract(pixel / uCellPx);
      vec2 lu = (localUv - 0.5) / max(uGlyphFrac, 0.001) + 0.5;
      float inside = step(0.0, lu.x) * step(lu.x, 1.0) * step(0.0, lu.y) * step(lu.y, 1.0);
      float eps = 0.004;
      lu = clamp(lu, eps, 1.0 - eps);
      vec2 atlasUv = vec2((idx + lu.x) / uGlyphCount, lu.y);
      float ink = texture2D(uAtlasTex, atlasUv).a * inside;

      // Brightness lands here instead of on glyph choice: same density
      // everywhere, dark areas simply sit at lower opacity. The click
      // front's decaying band adds a slight lift as cells get retyped.
      float toneAlpha = min(1.0, mix(uDarkOpacity, 1.0, shade) + band);

      // Contrast guard: whitened glyphs vanish on near-blown highlights
      // (white on white). Proven live via the debug mask - the gap between a
      // figure's legs was correctly marked background and rendered, but sat
      // on the backdrop's hottest zone and was invisible. On cells above
      // ~0.8 brightness the glyph flips to a darkened tone of the same hue.
      // Judged on the CELL average, not the pixel, so one glyph never
      // splits half-white half-dark across a gradient.
      float hot = smoothstep(0.78, 0.92, lum);
      vec3 glyphColor = mix(mix(fullRes.rgb, vec3(1.0), uWhitening), fullRes.rgb * 0.55, hot);
      vec3 finalRgb   = mix(fullRes.rgb, glyphColor, ink * presence * uOpacity * toneAlpha);

      gl_FragColor = vec4(finalRgb, fullRes.a);
    }
  `;

  // --- Constants ------------------------------------------------------------

  const FONT_STACK        = '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';
  const DEFAULT_GLYPHS    = ['1', 'x', '0', 'X', '*', '#', '@'];
  const ATLAS_CELL_H      = 94;
  const THRESH_LOW_START  = 0.78;  // scroll progress 0 - only the brightest cells show
  const THRESH_HIGH_START = 0.97;
  const CHURN_VELOCITY_DIVISOR = 2500;
  const SEED_RUN_FRAC     = 0.1;   // a border run must span 10% of the perimeter to seed the walk
  const RIPPLE_SPEED_CSS  = 900;   // click typewriter front speed, CSS px/s

  // --- Helpers ----------------------------------------------------------

  // The atlas cell is measured from the font, not guessed. Drawing a glyph at
  // two thirds of its cell leaves a visible gutter in both directions; sizing
  // the cell to the character's own advance width and full line height packs
  // them edge to edge, which is what the reference actually looks like.
  function buildGlyphAtlas(glyphs, fontFamily) {
    const probe = document.createElement('canvas').getContext('2d');
    const font = '600 ' + ATLAS_CELL_H + 'px ' + fontFamily;
    probe.font = font;
    const cellW = Math.max(1, Math.round(probe.measureText('0').width));

    const canvas = document.createElement('canvas');
    canvas.width  = cellW * glyphs.length;
    canvas.height = ATLAS_CELL_H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle    = '#ffffff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font;
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      if (!g) continue;
      ctx.fillText(g, cellW * i + cellW / 2, ATLAS_CELL_H * 0.54);
    }
    return { canvas: canvas, cellW: cellW, aspect: cellW / ATLAS_CELL_H };
  }

  function hueDirOf(c) {
    const mn = Math.min(c[0], c[1], c[2]);
    const ch = [c[0] - mn, c[1] - mn, c[2] - mn];
    const m = Math.max(ch[0], ch[1], ch[2]);
    return m <= 0.001 ? [0, 0, 0] : [ch[0] / m, ch[1] / m, ch[2] / m];
  }

  // Sample a supplied mask image down to the cell grid, using the same
  // cover-fit crop the shader applies to the source so the two line up.
  // WebGL reads its own buffers bottom-up while a canvas is top-down, hence
  // the row flip.
  function sampleMaskToGrid(img, cols, rows, containerAspect) {
    const cv = document.createElement('canvas');
    cv.width = cols;
    cv.height = rows;
    const ctx = cv.getContext('2d');
    const imgAspect = img.width / img.height;
    const ratio = containerAspect / imgAspect;
    const sw = ratio > 1 ? img.width : img.width * ratio;
    const sh = ratio > 1 ? img.height / ratio : img.height;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, cols, rows);
    const px = ctx.getImageData(0, 0, cols, rows).data;
    const out = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        out[(rows - 1 - y) * cols + x] = px[(y * cols + x) * 4] > 127 ? 1 : 0;
      }
    }
    return out;
  }

  function parseHexRgb(hex) {
    const h = String(hex).replace('#', '').trim();
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    const n = parseInt(full, 16);
    if (isNaN(n) || full.length !== 6) return null;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function parseGlyphs(container) {
    const attr = container.dataset.anmGlyphs;
    if (!attr) return DEFAULT_GLYPHS.slice();
    return attr.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }

  // --- Init ---------------------------------------------------------------

  function initShader(container) {
    // 1. Read data-anm-* attributes
    const imageSrc      = container.dataset.anmImage || '';
    const maskSrc        = container.dataset.anmMask || '';
    const videoSrc       = container.dataset.anmVideo || '';
    // Floor of 4: below that a cell is fewer than 8 device px on retina and
    // glyphs collapse into unreadable noise.
    const cellSizeCss    = Math.max(4, parseFloat(container.dataset.anmCellSize ?? '8'));
    const scrollEnabled  = (container.dataset.anmScroll ?? 'true') !== 'false';
    const glyphs          = parseGlyphs(container);
    const threshLow       = parseFloat(container.dataset.anmThreshLow     ?? '0.32');
    const threshHigh      = parseFloat(container.dataset.anmThreshHigh    ?? '0.7');
    const whitening       = parseFloat(container.dataset.anmWhitening     ?? '0.7');
    const opacity         = parseFloat(container.dataset.anmOpacity       ?? '0.9');
    const jitter          = parseFloat(container.dataset.anmJitter        ?? '0.35');
    const reshuffleRate   = parseFloat(container.dataset.anmReshuffleRate ?? '0.6');
    const charGap         = parseFloat(container.dataset.anmCharGap       ?? '0.3');
    const shadeMix        = parseFloat(container.dataset.anmShadeMix      ?? '0');
    const darkOpacity     = parseFloat(container.dataset.anmDarkOpacity   ?? '0.2');
    const detailThresh    = parseFloat(container.dataset.anmDetailThresh   ?? '0.1');
    const detailStrength  = parseFloat(container.dataset.anmDetailStrength ?? '1');
    const keyColorAttr    = container.dataset.anmKeyColor || '';
    const keyTolerance    = parseFloat(container.dataset.anmKeyTolerance  ?? '0.25');
    const colorStep       = parseFloat(container.dataset.anmColorStep    ?? '0.03');
    const minRegionCells  = parseFloat(container.dataset.anmMinRegion    ?? '10');
    const edgeFade        = parseFloat(container.dataset.anmEdgeFade     ?? '1.2');
    const edgePush        = parseFloat(container.dataset.anmEdgePush     ?? '0.02');

    // Colour-key mode is opt-in: absent attribute = brightness decides.
    // "auto" reads the background colour off the frame border, on the theory
    // that whatever touches the edges is the backdrop.
    const keyEnabled = keyColorAttr.length > 0;
    const keyAuto     = keyColorAttr.toLowerCase() === 'auto';
    const keyManual   = keyEnabled && !keyAuto ? parseHexRgb(keyColorAttr) : null;

    // 2. Create and append canvas
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    // 3. Three.js setup
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2));

    // 4a. Downsample pass - renders the source into a target sized to the
    // cell grid. Relies on the SOURCE texture's own mipmaps: rendering to a
    // tiny target lets the GPU pick/blend mip levels per the screen-space
    // derivative of the UV, which is a proper box average, not a point
    // sample. Image textures generate mipmaps by default. Video textures do
    // not (three.js disables it - regenerating mipmaps every frame from a
    // live video is a real cost) - so on a moving video source this pass
    // degrades to a 4-texel bilinear sample and some cell boil is expected.
    // The shipped demo uses a still specifically to avoid this; see
    // .claude/skills/shader/webgl-implementation.md "real-time ordered
    // dithering of moving video inherently boils".
    const geometry = new THREE.PlaneGeometry(2, 2);

    const dsUniforms = {
      uSourceTex:        { value: null },
      uContainerAspect:  { value: 1.0 },
      uImageAspect:      { value: 1.0 },
      uCells:            { value: new THREE.Vector2(1, 1) },
      uFullFrame:        { value: 0 },
    };
    const dsMaterial = new THREE.ShaderMaterial({ uniforms: dsUniforms, vertexShader: VERT, fragmentShader: FRAG_DOWNSAMPLE });
    const dsScene  = new THREE.Scene();
    const dsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    dsScene.add(new THREE.Mesh(geometry, dsMaterial));

    let downsampleRT = null;
    let analysisRT   = null;
    let maskTexture = null;
    let maskImage   = null;
    let maskGrid    = null;

    // 4b. Glyph atlas - built at boot on a 2D canvas, rebuilt once real fonts
    // are ready (see the fontsReady handler below).
    let atlas = buildGlyphAtlas(glyphs, FONT_STACK);
    let cellAspect = atlas.aspect;
    const atlasTexture = new THREE.CanvasTexture(atlas.canvas);
    atlasTexture.minFilter      = THREE.NearestFilter;
    atlasTexture.magFilter      = THREE.NearestFilter;
    atlasTexture.generateMipmaps = false;

    // 4c. Main pass
    const mainUniforms = {
      uSourceTex:        { value: null },
      uDownsampledTex:   { value: null },
      uPresenceTex:      { value: null },
      uAtlasTex:         { value: atlasTexture },
      uResolution:       { value: new THREE.Vector2(1, 1) },
      uCellPx:           { value: new THREE.Vector2(cellSizeCss, cellSizeCss / atlas.aspect) },
      uCells:            { value: new THREE.Vector2(1, 1) },
      uGlyphCount:       { value: glyphs.length },
      uThreshLow:        { value: THRESH_LOW_START },
      uThreshHigh:       { value: THRESH_HIGH_START },
      uLumMin:           { value: 0.0 },
      uLumMax:           { value: 1.0 },
      uWhitening:        { value: whitening },
      uOpacity:          { value: opacity },
      uJitter:           { value: jitter },
      uTime:             { value: 0 },
      uReshuffleRate:    { value: reshuffleRate },
      uChurn:            { value: 0 },
      uWaveCenter:       { value: new THREE.Vector2(0.5, 0.5) },
      uWaveMaxDist:      { value: 1 },
      uClickCenter:      { value: new THREE.Vector2(0, 0) },
      uClickStart:       { value: -1 },
      uRippleSpeed:      { value: 900 },
      uContainerAspect:  { value: 1.0 },
      uImageAspect:      { value: 1.0 },
      uGlyphFrac:        { value: 1 / (1 + charGap) },
      uShadeMix:         { value: shadeMix },
      uDarkOpacity:      { value: darkOpacity },
      uLoaded:           { value: false },
    };
    const mainMaterial = new THREE.ShaderMaterial({ uniforms: mainUniforms, vertexShader: VERT, fragmentShader: FRAG_MAIN });
    const mainScene  = new THREE.Scene();
    const mainCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    mainScene.add(new THREE.Mesh(geometry, mainMaterial));

    // 5. Sizing - ResizeObserver, cell size locked in screen pixels
    // Only reallocate when the cell count actually changes - a resize that
    // leaves the grid the same size must not churn GPU render targets.
    function rebuildDownsampleTarget(cols, rows) {
      if (downsampleRT && downsampleRT.width === cols && downsampleRT.height === rows) return;
      if (downsampleRT) {
        downsampleRT.texture.dispose();
        downsampleRT.dispose();
      }
      downsampleRT = new THREE.WebGLRenderTarget(cols, rows, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
      mainUniforms.uDownsampledTex.value = downsampleRT.texture;

    }

    function resize() {
      const w = container.offsetWidth || 1;
      const h = container.offsetHeight || 1;
      renderer.setSize(w, h);

      const bufW = canvas.width || 1;
      const bufH = canvas.height || 1;
      const dpr  = renderer.getPixelRatio();

      const cellWpx = cellSizeCss * (1 + charGap) * dpr;
      const cellHpx = cellWpx / cellAspect;
      const cols = Math.max(1, Math.ceil(bufW / cellWpx));
      const rows = Math.max(1, Math.ceil(bufH / cellHpx));

      mainUniforms.uResolution.value.set(bufW, bufH);
      mainUniforms.uCellPx.value.set(cellWpx, cellHpx);
      mainUniforms.uRippleSpeed.value = RIPPLE_SPEED_CSS * dpr;
      mainUniforms.uCells.value.set(cols, rows);
      mainUniforms.uContainerAspect.value = w / h;
      dsUniforms.uContainerAspect.value   = w / h;
      dsUniforms.uCells.value.set(cols, rows);

      rebuildDownsampleTarget(cols, rows);
      analyzeSource();
    }
    let resizeTimer = null;
    function scheduleResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    }
    const ro = new ResizeObserver(scheduleResize);
    ro.observe(container);
    resize();

    // 6. Luminance normalisation - a small CPU readback of the boxed-down
    // source so the threshold band maps to THIS image's own brightness
    // range rather than absolute 0-1 (an absolute floor looks dead on a
    // dark photo). One-time for a still; re-sampled on an interval for
    // video so a scene change eventually re-centers the range without
    // paying a per-frame GPU readback stall.
    // ---- Subject tracking (all on the CPU, once per load/resize) ----
    //
    // Produces one number per cell: 0 over the subject, ramping to 1 in open
    // background. Every rule here survived measurement on ten test images;
    // the failed alternatives are noted where they matter.
    //
    //  1. smooth  - Weber contrast below detail-thresh. Relative, not
    //     absolute: dark textures (shoe laces) vanish in absolute variance.
    //  2. walk    - background grows from the frame border, one cell at a
    //     time, joining a neighbour only on a small colour step. A global
    //     colour key cannot do this job: a gradient is not one colour.
    //  3. openings - components of unreached cells matching the LIT half of
    //     the background palette (>= min-region cells). An opening through a
    //     subject shows the lit backdrop behind it; every subject/background
    //     ambiguity lives on the shadow side, so dark tones never reclaim.
    //     (Whole-region tests never fire - openings touch the subject and
    //     merge with it; per-cell tests with a full palette lit the legs.)
    //  4. holes   - unreached components under min-region cells are cutoff
    //     artefacts, closed unconditionally.
    //  5. fade    - distance-to-subject ramp, baked into the texture. The
    //     old GPU pass took min(cell, blurred neighbourhood), which crushed
    //     any background corridor narrower than the blur radius to zero -
    //     the "randomly missing background" bug. Distance keeps a narrow
    //     corridor lit at reduced strength instead of deleting it.
    function uploadMask(reach, cols, rows, buf) {
      const n = cols * rows;

      // Brightness range over the BACKGROUND only - a near-black subject
      // would drag the floor to zero and starve the backdrop's darker half.
      let min = 1, max = 0, kept = 0;
      for (let c = 0; c < n; c++) {
        if (!reach[c]) continue;
        const i = c * 4;
        const l = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
        if (l < min) min = l;
        if (l > max) max = l;
        kept++;
      }
      if (kept < n * 0.02) { min = 0; max = 1; }
      if (max - min < 0.05) { min = Math.max(0, min - 0.1); max = Math.min(1, max + 0.1); }
      mainUniforms.uLumMin.value = min;
      mainUniforms.uLumMax.value = max;

      // Distance transform: multi-source BFS outward from every subject cell.
      const dist = new Int32Array(n).fill(-1);
      const q = [];
      for (let c = 0; c < n; c++) {
        if (!reach[c]) { dist[c] = 0; q.push(c); }
      }
      for (let head = 0; head < q.length; head++) {
        const c = q[head];
        const x = c % cols, y = (c - x) / cols;
        const d = dist[c] + 1;
        if (x > 0        && dist[c - 1]    === -1) { dist[c - 1]    = d; q.push(c - 1); }
        if (x < cols - 1 && dist[c + 1]    === -1) { dist[c + 1]    = d; q.push(c + 1); }
        if (y > 0        && dist[c - cols] === -1) { dist[c - cols] = d; q.push(c - cols); }
        if (y < rows - 1 && dist[c + cols] === -1) { dist[c + cols] = d; q.push(c + cols); }
      }

      // Wave origin: the subject's centroid in cell coordinates - the
      // reshuffle wave radiates from here. No subject -> frame centre.
      // Max distance is to the farthest corner in PIXELS (cells are taller
      // than wide, so cell-space distance would make the wave elliptical).
      let sx = 0, sy = 0, sn = 0;
      for (let c = 0; c < n; c++) {
        if (reach[c]) continue;
        sx += c % cols; sy += (c / cols) | 0; sn++;
      }
      const wcx = sn ? sx / sn + 0.5 : cols / 2;
      const wcy = sn ? sy / sn + 0.5 : rows / 2;
      mainUniforms.uWaveCenter.value.set(wcx, wcy);
      const cw = mainUniforms.uCellPx.value.x, chp = mainUniforms.uCellPx.value.y;
      const fx = Math.max(wcx, cols - wcx) * cw;
      const fy = Math.max(wcy, rows - wcy) * chp;
      mainUniforms.uWaveMaxDist.value = Math.max(1, Math.hypot(fx, fy));

      const data = new Uint8Array(n * 4);
      const noSubject = q.length === 0 || dist[0] === -1;
      for (let c = 0; c < n; c++) {
        let v = 0;
        if (reach[c]) {
          const d = noSubject ? 1e9 : dist[c];
          v = Math.max(0, Math.min(1, d / Math.max(edgeFade, 0.001) - edgePush));
        }
        data[c * 4] = Math.round(v * 255);
        data[c * 4 + 3] = 255;
      }
      if (maskTexture) maskTexture.dispose();
      maskTexture = new THREE.DataTexture(data, cols, rows);
      maskTexture.minFilter = THREE.NearestFilter;
      maskTexture.magFilter = THREE.NearestFilter;
      maskTexture.generateMipmaps = false;
      maskTexture.needsUpdate = true;
      mainUniforms.uPresenceTex.value = maskTexture;
    }

    function analyzeSource() {
      if (!dsUniforms.uSourceTex.value || !downsampleRT) return;
      const cols = downsampleRT.width;
      const rows = downsampleRT.height;
      const n = cols * rows;

      renderer.setRenderTarget(downsampleRT);
      renderer.render(dsScene, dsCamera);
      renderer.setRenderTarget(null);
      const buf = new Uint8Array(n * 4);
      renderer.readRenderTargetPixels(downsampleRT, 0, 0, cols, rows, buf);

      // A supplied mask is the ONLY authority when present - it is a
      // statement of the subject, everything below is an estimate. The
      // designed escape hatch for photos the estimate cannot read.
      if (maskImage) maskGrid = sampleMaskToGrid(maskImage, cols, rows, mainUniforms.uContainerAspect.value);
      if (maskGrid && maskGrid.length === n) {
        uploadMask(maskGrid, cols, rows, buf);
        if (container.getAttribute('data-anm-debug') !== null) {
          const stride = Math.max(1, Math.ceil(cols / 110));
          const lines = [];
          for (let y = rows - 1; y >= 0; y -= stride) {
            let line = '';
            for (let x = 0; x < cols; x += stride) line += maskGrid[y * cols + x] ? '@' : '.';
            lines.push(line);
          }
          console.log('[ascii-overlay] SUPPLIED mask active ' + cols + 'x' + rows + ' (@ bg | . subject)\n' + lines.join('\n'));
        }
        return;
      }

      // Subject analysis runs on the FULL photo, not the viewport's cover
      // crop - a narrow window would otherwise change which parts of the
      // image touch the frame border, and detection quality would depend on
      // the visitor's window shape. Rendered into a separate small target
      // with the crop disabled, analyzed there, then mapped back to screen
      // cells through the same cover transform the main pass uses.
      const ia = mainUniforms.uImageAspect.value || 1;
      const cellRatio = mainUniforms.uCellPx.value.y / Math.max(mainUniforms.uCellPx.value.x, 0.001);
      const colsA = Math.max(16, Math.min(240, Math.round(Math.sqrt(n * ia * cellRatio))));
      const rowsA = Math.max(8, Math.round(colsA / (ia * cellRatio)));
      if (!analysisRT || analysisRT.width !== colsA || analysisRT.height !== rowsA) {
        if (analysisRT) { analysisRT.texture.dispose(); analysisRT.dispose(); }
        analysisRT = new THREE.WebGLRenderTarget(colsA, rowsA, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          generateMipmaps: false,
        });
      }
      const savedCells = dsUniforms.uCells.value.clone();
      dsUniforms.uFullFrame.value = 1;
      dsUniforms.uCells.value.set(colsA, rowsA);
      renderer.setRenderTarget(analysisRT);
      renderer.render(dsScene, dsCamera);
      renderer.setRenderTarget(null);
      dsUniforms.uFullFrame.value = 0;
      dsUniforms.uCells.value.copy(savedCells);
      const bufA = new Uint8Array(colsA * rowsA * 4);
      renderer.readRenderTargetPixels(analysisRT, 0, 0, colsA, rowsA, bufA);

      const A = computeReach(bufA, colsA, rowsA);

      // Map the image-space verdicts onto the screen cell grid through the
      // cover transform (JS twin of the shader's coverUv).
      const reach = new Uint8Array(n);
      const ratio = mainUniforms.uContainerAspect.value / ia;
      const sxu = ratio > 1 ? 1 : ratio;
      const syu = ratio > 1 ? 1 / ratio : 1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const u = Math.min(Math.max(((x + 0.5) / cols - 0.5) * sxu + 0.5, 0), 0.9999);
          const v = Math.min(Math.max(((y + 0.5) / rows - 0.5) * syu + 0.5, 0), 0.9999);
          reach[y * cols + x] = A.reach[Math.floor(v * rowsA) * colsA + Math.floor(u * colsA)];
        }
      }

      uploadMask(reach, cols, rows, buf);

      // Diagnostics, on only when the container carries data-anm-debug.
      // Reports the IMAGE-space analysis (what detection actually saw).
      if (container.getAttribute('data-anm-debug') !== null) {
        console.log('[ascii-overlay] border runs [' + A.runLen.join(',') + '] minRun=' + A.minRun +
          (A.anyQualified ? '' : ' (no corner-anchored long run - fallback: all border seeds)'));
        debugReport(colsA, rowsA, bufA, A.smooth, A.reach, A.okc, A.medLum, A.palette, A.minRegion);
      }
    }

    function computeReach(buf, cols, rows) {
      const n = cols * rows;

      // 1. smooth
      const detailCut = detailThresh * 255;
      const smooth = new Uint8Array(n);
      for (let c = 0; c < n; c++) {
        smooth[c] = (detailStrength > 0 && buf[c * 4 + 3] > detailCut) ? 0 : 1;
      }

      // Optional key colour restricts which border cells may SEED the walk
      // (for shots where something other than the backdrop touches the
      // frame edge). It never judges interior cells.
      let keyHue = null;
      if (keyEnabled) {
        let kr = 0, kg = 0, kb = 0, kn = 0;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            if (x !== 0 && y !== 0 && x !== cols - 1 && y !== rows - 1) continue;
            const i = (y * cols + x) * 4;
            kr += buf[i]; kg += buf[i + 1]; kb += buf[i + 2]; kn++;
          }
        }
        keyHue = hueDirOf(keyManual || [kr / kn / 255, kg / kn / 255, kb / kn / 255]);
      }

      // 2. walk - seeds come from perimeter RUNS, not raw border cells. A
      // subject cropped by the frame (a forehead, a product edge) puts its
      // own smooth surface on the border and would seed the walk from
      // inside the subject; but such a patch is a SHORT stretch of the
      // perimeter, bounded by busy cells (hair, edges), while any real
      // backdrop - gradients included, since the run test is stepwise -
      // wraps a long continuous stretch. Only long runs seed.
      const stepCut2 = (colorStep * 255) * (colorStep * 255);
      const ring = [];
      for (let x = 0; x < cols; x++) ring.push(x);
      for (let y = 1; y < rows; y++) ring.push(y * cols + cols - 1);
      for (let x = cols - 2; x >= 0; x--) ring.push((rows - 1) * cols + x);
      for (let y = rows - 2; y >= 1; y--) ring.push(y * cols);
      const m = ring.length;
      const seedable = new Uint8Array(m);
      for (let p = 0; p < m; p++) {
        const c = ring[p];
        if (!smooth[c]) continue;
        if (keyHue) {
          const h = hueDirOf([buf[c * 4] / 255, buf[c * 4 + 1] / 255, buf[c * 4 + 2] / 255]);
          if (Math.hypot(h[0] - keyHue[0], h[1] - keyHue[1], h[2] - keyHue[2]) > keyTolerance) continue;
        }
        seedable[p] = 1;
      }
      // Rotate the scan to start at a break so a run crossing the ring's
      // seam is counted once, then split into stepwise-continuous runs.
      // A run must ALSO contain a frame corner to seed: a real backdrop
      // (sky, floor, gradient) always anchors a corner of the photo, while
      // a cropped-in subject surface crosses mid-border - on a close-up its
      // run alone can beat any length threshold (a helmet crown measured 51
      // of 442 perimeter cells), but it never owns a corner.
      const corners = [0, cols - 1, cols + rows - 2, 2 * cols + rows - 3];
      let start = 0;
      while (start < m && seedable[start]) start++;
      const runId = new Int32Array(m).fill(-1);
      const runLen = [];
      const runCorner = [];
      let cur = -1;
      for (let q = 0; q < m; q++) {
        const p = (start + q) % m;
        if (!seedable[p]) { cur = -1; continue; }
        if (cur >= 0) {
          const a = ring[(start + q - 1) % m] * 4, b = ring[p] * 4;
          const dr = buf[b] - buf[a], dg = buf[b + 1] - buf[a + 1], db = buf[b + 2] - buf[a + 2];
          if (dr * dr + dg * dg + db * db > stepCut2) cur = -1;
        }
        if (cur < 0) { cur = runLen.length; runLen.push(0); runCorner.push(false); }
        runId[p] = cur; runLen[cur]++;
        if (corners.indexOf(p) !== -1) runCorner[cur] = true;
      }
      const minRun = Math.max(Math.round(m * SEED_RUN_FRAC), 8);
      const anyQualified = runLen.some(function (len, r) { return len >= minRun && runCorner[r]; });
      const reach = new Uint8Array(n);
      const stack = [];
      for (let p = 0; p < m; p++) {
        if (!seedable[p]) continue;
        // No corner-anchored long run anywhere (backdrop only peeks through
        // small pockets) - fall back to seeding every smooth border cell
        // rather than rendering nothing.
        if (anyQualified && (runLen[runId[p]] < minRun || !runCorner[runId[p]])) continue;
        const c = ring[p];
        if (reach[c]) continue;
        reach[c] = 1; stack.push(c);
      }
      while (stack.length) {
        const c = stack.pop();
        const x = c % cols, y = (c - x) / cols;
        const i = c * 4;
        for (let k = 0; k < 4; k++) {
          const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const c2 = ny * cols + nx;
          if (reach[c2] || !smooth[c2]) continue;
          const j = c2 * 4;
          const dr = buf[j] - buf[i], dg = buf[j + 1] - buf[i + 1], db = buf[j + 2] - buf[i + 2];
          if (dr * dr + dg * dg + db * db > stepCut2) continue;
          reach[c2] = 1; stack.push(c2);
        }
      }

      // 3. openings - palette is the LIT half of the background
      const minRegion = Math.max(minRegionCells, Math.round(n * 0.0015));
      const lums = [];
      for (let c = 0; c < n; c += 2) {
        if (reach[c]) lums.push(0.2126 * buf[c * 4] + 0.7152 * buf[c * 4 + 1] + 0.0722 * buf[c * 4 + 2]);
      }
      lums.sort(function (a, b) { return a - b; });
      const medLum = lums.length ? lums[lums.length >> 1] : 0;
      const palette = [];
      for (let c = 0; c < n; c += 2) {
        if (!reach[c]) continue;
        const i = c * 4;
        if (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2] >= medLum) {
          palette.push(buf[i], buf[i + 1], buf[i + 2]);
        }
      }
      const palTol2 = (0.045 * 255) * (0.045 * 255);
      const okc = new Uint8Array(n);
      for (let c = 0; c < n; c++) {
        if (reach[c] || !smooth[c]) continue;
        const i = c * 4;
        const r = buf[i], g = buf[i + 1], b2 = buf[i + 2];
        for (let k = 0; k < palette.length; k += 3) {
          const dr = palette[k] - r, dg = palette[k + 1] - g, db = palette[k + 2] - b2;
          if (dr * dr + dg * dg + db * db <= palTol2) { okc[c] = 1; break; }
        }
      }
      const members = [];
      const seen = new Uint8Array(n);
      for (let seed = 0; seed < n; seed++) {
        if (!okc[seed] || seen[seed]) continue;
        members.length = 0;
        seen[seed] = 1;
        stack.push(seed);
        while (stack.length) {
          const c = stack.pop();
          members.push(c);
          const x = c % cols, y = (c - x) / cols;
          if (x > 0        && okc[c - 1]    && !seen[c - 1])    { seen[c - 1]    = 1; stack.push(c - 1); }
          if (x < cols - 1 && okc[c + 1]    && !seen[c + 1])    { seen[c + 1]    = 1; stack.push(c + 1); }
          if (y > 0        && okc[c - cols] && !seen[c - cols]) { seen[c - cols] = 1; stack.push(c - cols); }
          if (y < rows - 1 && okc[c + cols] && !seen[c + cols]) { seen[c + cols] = 1; stack.push(c + cols); }
        }
        if (members.length >= minRegion) {
          for (let i = 0; i < members.length; i++) reach[members[i]] = 1;
        }
      }

      // 4. holes
      const hol = new Uint8Array(n);
      for (let seed = 0; seed < n; seed++) {
        if (reach[seed] || hol[seed]) continue;
        members.length = 0;
        hol[seed] = 1;
        stack.push(seed);
        while (stack.length) {
          const c = stack.pop();
          members.push(c);
          const x = c % cols, y = (c - x) / cols;
          if (x > 0        && !reach[c - 1]    && !hol[c - 1])    { hol[c - 1]    = 1; stack.push(c - 1); }
          if (x < cols - 1 && !reach[c + 1]    && !hol[c + 1])    { hol[c + 1]    = 1; stack.push(c + 1); }
          if (y > 0        && !reach[c - cols] && !hol[c - cols]) { hol[c - cols] = 1; stack.push(c - cols); }
          if (y < rows - 1 && !reach[c + cols] && !hol[c + cols]) { hol[c + cols] = 1; stack.push(c + cols); }
        }
        if (members.length < minRegion) {
          for (let i = 0; i < members.length; i++) reach[members[i]] = 1;
        }
      }

      return {
        reach: reach, smooth: smooth, okc: okc, medLum: medLum, palette: palette,
        minRegion: minRegion, runLen: runLen, minRun: minRun, anyQualified: anyQualified,
      };
    }

    function debugReport(cols, rows, buf, smooth, reach, okc, medLum, palette, minRegion) {
      const n = cols * rows;
      const palTol2 = (0.045 * 255) * (0.045 * 255);
      let reached = 0;
      for (let c = 0; c < n; c++) reached += reach[c];
      console.log('[ascii-overlay] grid ' + cols + 'x' + rows + ' cells=' + n +
        ' reached=' + (100 * reached / n).toFixed(1) + '%' +
        ' minRegion=' + minRegion + ' medLum=' + medLum.toFixed(1) +
        ' palette=' + (palette.length / 3) + ' colours');
      const seen2 = new Uint8Array(n);
      const stack2 = [];
      const regions = [];
      for (let seed = 0; seed < n; seed++) {
        if (reach[seed] || seen2[seed]) continue;
        const mem = [];
        seen2[seed] = 1; stack2.push(seed);
        while (stack2.length) {
          const c = stack2.pop();
          mem.push(c);
          const x = c % cols, y = (c - x) / cols;
          if (x > 0        && !reach[c - 1]    && !seen2[c - 1])    { seen2[c - 1]    = 1; stack2.push(c - 1); }
          if (x < cols - 1 && !reach[c + 1]    && !seen2[c + 1])    { seen2[c + 1]    = 1; stack2.push(c + 1); }
          if (y > 0        && !reach[c - cols] && !seen2[c - cols]) { seen2[c - cols] = 1; stack2.push(c - cols); }
          if (y < rows - 1 && !reach[c + cols] && !seen2[c + cols]) { seen2[c + cols] = 1; stack2.push(c + cols); }
        }
        regions.push(mem);
      }
      regions.sort(function (a, b) { return b.length - a.length; });
      for (let r = 0; r < Math.min(6, regions.length); r++) {
        const mem = regions[r];
        let busy = 0, palFail = 0, okCells = 0, lum = 0, minD = 1e9;
        let bx0 = cols, bx1 = 0, by0 = rows, by1 = 0;
        for (let i = 0; i < mem.length; i++) {
          const c = mem[i];
          const x = c % cols, y = (c - x) / cols;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
          const j = c * 4;
          lum += 0.2126 * buf[j] + 0.7152 * buf[j + 1] + 0.0722 * buf[j + 2];
          if (!smooth[c]) { busy++; continue; }
          if (okc[c]) { okCells++; continue; }
          let best = 1e9;
          for (let k = 0; k < palette.length; k += 3) {
            const dr = palette[k] - buf[j], dg = palette[k + 1] - buf[j + 1], db = palette[k + 2] - buf[j + 2];
            const d = dr * dr + dg * dg + db * db;
            if (d < best) best = d;
          }
          if (best > palTol2) palFail++;
          if (best < minD) minD = best;
        }
        console.log('[ascii-overlay] region#' + r + ' size=' + mem.length +
          ' bbox=[' + bx0 + '-' + bx1 + ',' + by0 + '-' + by1 + ']' +
          ' meanLum=' + (lum / mem.length).toFixed(1) +
          ' busy=' + busy + ' palette-fail=' + palFail + ' matched=' + okCells +
          ' closestPaletteDist=' + (minD < 1e9 ? Math.sqrt(minD).toFixed(1) : 'n/a') +
          '  (matched cells form openings only if their own component >= ' + minRegion + ')');
      }
      const stride = Math.max(1, Math.ceil(cols / 110));
      const lines = [];
      for (let y = rows - 1; y >= 0; y -= stride) {
        let line = '';
        for (let x = 0; x < cols; x += stride) {
          const c = y * cols + x;
          line += reach[c] ? '@' : (smooth[c] ? (okc[c] ? 'o' : '.') : '#');
        }
        lines.push(line);
      }
      console.log('[ascii-overlay] mask (@ bg | . subject-smooth | # subject-busy | o palette-matched but unclaimed)\n' + lines.join('\n'));
    }

    // 7. Load image or video texture (same texture path for both)
    let sourceTexture = null;
    let video = null;
    let videoLumTimer = null;

    function onSourceReady(texture, aspect) {
      sourceTexture = texture;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      dsUniforms.uSourceTex.value   = texture;
      mainUniforms.uSourceTex.value = texture;
      mainUniforms.uImageAspect.value = aspect;
      dsUniforms.uImageAspect.value   = aspect;
      mainUniforms.uLoaded.value = true;
      resize();
      analyzeSource();
    }

    if (videoSrc) {
      video = document.createElement('video');
      video.src         = videoSrc;
      video.muted        = true;
      video.loop          = true;
      video.playsInline  = true;
      video.crossOrigin  = 'anonymous';
      video.autoplay      = true;
      video.addEventListener('loadeddata', function () {
        const tex = new THREE.VideoTexture(video);
        onSourceReady(tex, video.videoWidth / video.videoHeight);
        videoLumTimer = window.setInterval(analyzeSource, 2000);
      });
      video.play().catch(function () {});
    } else if (imageSrc) {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(
        imageSrc,
        function (texture) { onSourceReady(texture, texture.image.width / texture.image.height); },
        undefined,
        function (err) { console.error('[ascii-overlay] Failed to load image:', imageSrc, err); }
      );
    }

    // Optional subject mask. White marks where characters may land. When it is
    // present it overrides the automatic estimate entirely.
    if (maskSrc) {
      const maskImg = new Image();
      maskImg.crossOrigin = 'anonymous';
      maskImg.onload = function () { maskImage = maskImg; analyzeSource(); };
      maskImg.onerror = function () { console.error('[ascii-overlay] Failed to load mask:', maskSrc); };
      maskImg.src = maskSrc;
    }

    // 8. Render loop via GSAP ticker
    let churn = 0;
    let churnTarget = 0;

    function render() {
      churnTarget *= 0.95;
      churn += (churnTarget - churn) * 0.15;
      mainUniforms.uChurn.value = churn;
      mainUniforms.uTime.value  = gsap.ticker.time;

      if (mainUniforms.uLoaded.value) {
        renderer.setRenderTarget(downsampleRT);
        renderer.render(dsScene, dsCamera);
        renderer.setRenderTarget(null);
      }
      renderer.render(mainScene, mainCamera);
    }
    gsap.ticker.add(render);
    gsap.ticker.lagSmoothing(0);

    // A WebGL loop on a hidden tab is pure battery burn - stop it.
    function onVisibility() {
      if (document.hidden) gsap.ticker.remove(render);
      else gsap.ticker.add(render);
    }
    document.addEventListener('visibilitychange', onVisibility);

    // Click ripple - a one-shot wave front radiating from the pointer.
    // uClickStart < 0 means idle; each click restamps it.
    function onPointerDown(e) {
      const rect = canvas.getBoundingClientRect();
      const dpr  = renderer.getPixelRatio();
      const px = (e.clientX - rect.left) * dpr;
      const py = (rect.height - (e.clientY - rect.top)) * dpr;
      mainUniforms.uClickCenter.value.set(px / mainUniforms.uCellPx.value.x, py / mainUniforms.uCellPx.value.y);
      mainUniforms.uClickStart.value = gsap.ticker.time;
    }
    container.addEventListener('pointerdown', onPointerDown);

    // 9. Scroll drives the threshold band - the signature interaction.
    // Glyphs bloom in the highlights first, then flood into the midtones.
    // data-anm-scroll="false" skips the trigger and parks the band fully
    // open, for embeds where the component sits outside a scroll context.
    let st = null;
    if (scrollEnabled) {
      gsap.registerPlugin(ScrollTrigger);

      const scrollWrapper = container.closest('.shader-scroll-wrapper');
      const triggerEl      = scrollWrapper || container;
      const triggerStart    = scrollWrapper ? 'top top'      : 'top bottom';
      const triggerEnd      = scrollWrapper ? 'bottom bottom' : 'bottom top';

      const scrollProxy = { t: 0 };
      st = gsap.to(scrollProxy, {
        t: 1,
        ease: 'none',
        onUpdate: function () {
          const p = scrollProxy.t;
          mainUniforms.uThreshLow.value  = THRESH_LOW_START  + (threshLow  - THRESH_LOW_START)  * p;
          mainUniforms.uThreshHigh.value = THRESH_HIGH_START + (threshHigh - THRESH_HIGH_START) * p;
        },
        scrollTrigger: {
          trigger: triggerEl,
          start: triggerStart,
          end: triggerEnd,
          scrub: 1,
          onUpdate: function (self) {
            const v = Math.abs(self.getVelocity()) / CHURN_VELOCITY_DIVISOR;
            churnTarget = Math.min(1, v);
          },
        },
      });
    } else {
      mainUniforms.uThreshLow.value  = threshLow;
      mainUniforms.uThreshHigh.value = threshHigh;
    }

    // 10. Rebuild the atlas once real fonts are ready - the boot pass may
    // have fallen back to a system monospace font.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        atlas = buildGlyphAtlas(glyphs, FONT_STACK);
        cellAspect = atlas.aspect;
        atlasTexture.image = atlas.canvas;
        atlasTexture.needsUpdate = true;
        resize(); // the real font's advance width may differ from the fallback's
      });
    }

    // 11. Reduced motion - stop the loop, show one static frame
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.ticker.remove(render);
      render();
    }

    return {
      renderer: renderer,
      geometry: geometry,
      dsMaterial: dsMaterial,
      mainMaterial: mainMaterial,
      atlasTexture: atlasTexture,
      getMaskTexture:   function () { return maskTexture; },
      ro: ro,
      render: render,
      st: st,
      video: video,
      onVisibility: onVisibility,
      container: container,
      onPointerDown: onPointerDown,
      getResizeTimer: function () { return resizeTimer; },
      // Resolved lazily - sourceTexture/downsampleRT/videoLumTimer are all
      // reassigned asynchronously after this object is built.
      getSourceTexture: function () { return sourceTexture; },
      getDownsampleRT:  function () { return downsampleRT; },
      getAnalysisRT:    function () { return analysisRT; },
      getVideoLumTimer: function () { return videoLumTimer; },
    };
  }

  // --- Cleanup ------------------------------------------------------------

  function destroyShader(state) {
    gsap.ticker.remove(state.render);
    document.removeEventListener('visibilitychange', state.onVisibility);
    state.container.removeEventListener('pointerdown', state.onPointerDown);
    clearTimeout(state.getResizeTimer());
    if (state.st && state.st.scrollTrigger) state.st.scrollTrigger.kill();
    if (state.st) state.st.kill();
    state.ro.disconnect();

    state.geometry.dispose();
    state.dsMaterial.dispose();
    state.mainMaterial.dispose();

    const sourceTexture = state.getSourceTexture();
    if (sourceTexture) sourceTexture.dispose();
    state.atlasTexture.dispose();

    const downsampleRT = state.getDownsampleRT();
    if (downsampleRT) {
      downsampleRT.texture.dispose();
      downsampleRT.dispose();
    }
    const analysisRT = state.getAnalysisRT();
    if (analysisRT) {
      analysisRT.texture.dispose();
      analysisRT.dispose();
    }
    const maskTexture = state.getMaskTexture();
    if (maskTexture) maskTexture.dispose();

    const videoLumTimer = state.getVideoLumTimer();
    if (videoLumTimer) clearInterval(videoLumTimer);
    if (state.video) {
      state.video.pause();
      state.video.removeAttribute('src');
      state.video.load();
    }

    state.renderer.forceContextLoss();
    state.renderer.dispose();
  }

  // --- Boot - wait for GSAP and THREE --------------------------------------

  function waitForDeps(cb, attempts) {
    attempts = attempts || 0;
    if (typeof gsap !== 'undefined' && typeof THREE !== 'undefined') { cb(); return; }
    if (attempts < 100) setTimeout(function () { waitForDeps(cb, attempts + 1); }, 50);
    else console.error('[Annnimate] gsap or THREE failed to load');
  }

  waitForDeps(function () {
    const instances = [];
    document.querySelectorAll('[data-anm-ascii-overlay]').forEach(function (el) {
      const state = initShader(el);
      if (state) instances.push(state);
    });
    window.Anm = window.Anm || {};
    window.Anm.AsciiOverlay = {
      refresh: function () {
        instances.forEach(function (s) { destroyShader(s); });
        instances.length = 0;
        document.querySelectorAll('[data-anm-ascii-overlay]').forEach(function (el) {
          const canvas = el.querySelector('canvas');
          if (canvas) canvas.remove();
          const state = initShader(el);
          if (state) instances.push(state);
        });
      },
    };
  });

})();
