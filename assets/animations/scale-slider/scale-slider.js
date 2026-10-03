(function () {
  'use strict';

  // Scale Slider - square image cards on one bottom baseline, sized as a pure
  // function of x-position. Card boundaries sit on an exponential map whose
  // vanishing point is OFF-SCREEN past the tail edge, so cards scale down
  // continuously and proportionally as they travel tailward and exit the edge
  // cropped at minScale * heroSize (never collapsing to zero). With
  // ramp = minScale^(-1/(count-1)) exactly `count` cards tile the viewport
  // edge-to-edge, cards touch by construction, and a cropped card is always
  // mid-entry at the head - the loop has no seam in either direction.
  //
  // Plain DOM (no WebGL): each image is an <img> inside a frame div, sized and
  // positioned every frame via a fixed base + transform (translate + scale),
  // cover-cropped by object-fit with an object-position focus bias. ALL cards
  // are always rendered - off-stage ones park off-screen via their transform
  // and are clipped, never display-toggled, so the recycle jump (off one edge
  // to off the other) is invisible in BOTH travel directions.
  //
  // Driven by drag + inertia, autoplay drift, page-scroll, keyboard, and
  // optional prev/next arrows that animate to a perfectly-aligned card.
  // Standard viewport gate: data-anm-disable="mobile,landscape,tablet,desktop".
  function isDisabledOnViewport(el) {
    const disable = el.dataset.anmDisable;
    if (!disable) return false;
    const breakpoints = {
      mobile: '(max-width: 479px)',
      landscape: '(orientation: landscape) and (max-width: 767px)',
      tablet: '(max-width: 991px)',
      desktop: '(min-width: 992px)',
    };
    return disable.split(',').some(function (v) {
      const q = breakpoints[v.trim()];
      return q && window.matchMedia(q).matches;
    });
  }

  function initScaleSlider(container) {
    if (isDisabledOnViewport(container)) return null;

    const scene = container.querySelector('[data-anm-scale-slider-scene]');
    if (!scene) return null;

    // --- 1. Selectors ---
    // Each card is a frame div (clips) wrapping an <img> (scales for parallax).
    const cards = Array.prototype.slice.call(scene.querySelectorAll('[data-anm-scale-slider-card]'))
      .map(function (el) { return { el: el, img: el.querySelector('img') }; })
      .filter(function (c) { return c.img; });
    const M = cards.length;
    if (M < 3) return null;
    // Optional navigation (may be absent - the slider works without them).
    const prevBtn = container.querySelector('[data-anm-scale-slider-prev]');
    const nextBtn = container.querySelector('[data-anm-scale-slider-next]');

    // --- 2. Config ---
    const DIRECTION = container.dataset.anmDirection === 'ltr' ? 'ltr' : 'rtl';
    const COUNT_ATTR = container.dataset.anmCount || 'auto';
    const MIN_SCALE = Math.min(0.8, Math.max(0.05, parseFloat(container.dataset.anmMinScale || '0.3')));
    const AUTOPLAY = parseFloat(container.dataset.anmAutoplay || '0.0016');
    const DRAG = parseFloat(container.dataset.anmDrag || '0.0012');
    const SCROLL = parseFloat(container.dataset.anmScroll || '0.0002');
    const FOCUS_Y = parseFloat(container.dataset.anmFocusY || '0.22');
    const RADIUS = parseFloat(container.dataset.anmRadius || '0');
    const PARALLAX = Math.max(0, parseFloat(container.dataset.anmParallax || '0'));

    // --- 3. Constants ---
    const EASE_KEY = 'annnimateInOut';
    const OVERLAP = 1.5; // px - cards overlap their tail neighbour to hide sub-pixel seams
    const SCROLL_DAMP = 0.9; // per-frame decay of the scroll boost - higher = longer glide
    // drag: content follows the finger. rtl head is on the right, so a
    // rightward drag (+dx) advances travel toward the head; ltr mirrors.
    const DRAG_SIGN = DIRECTION === 'ltr' ? -1 : 1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- 4. State ---
    let viewW = 1, viewH = 1;
    let base = 100; // fixed px size of every card frame; size is driven by transform scale
    let visCount = 5;
    let rampR = 1.35, rampK = 1, rampXv = 0; // derived in computeRamp()
    let travel = 0;
    let dragX = 0;
    let scrollY = window.scrollY || 0;
    let scrollBoost = 0; // decaying extra drift speed from page scroll
    let running = true;
    let drag = null;
    let navTween = null; // active tween when an arrow is animating to a card
    let resizeTimer = null;

    // --- 5. Helpers ---
    function phaseNow() { return travel - Math.floor(travel); }

    // How many cards tile the stage. "auto" scales with viewport shape - more
    // cards on wider screens keeps the head card from exceeding the stage
    // height (a card taller than the stage would be clipped at the top and
    // read as non-square).
    function computeCount() {
      if (COUNT_ATTR !== 'auto') {
        return Math.max(3, Math.min(M - 1, parseInt(COUNT_ATTR, 10) || 5));
      }
      const aspect = viewW / viewH;
      return aspect >= 2.2 ? 6 : aspect >= 1.5 ? 5 : aspect >= 1.0 ? 4 : 3;
    }

    // Solve the ramp from the two knobs so exactly visCount cards tile
    // [0, viewW] edge-to-edge at EVERY phase - head cropped past the right
    // edge (boundary(0) >= viewW), tail cropped past the left edge at
    // MIN_SCALE (boundary(visCount) <= 0). rampR is the neighbour size ratio
    // (each card R x its tail neighbour) set so the head:tail span == MIN_SCALE
    // across visCount cards. Anchoring the vanishing point at -MIN_SCALE * K
    // (not -MIN_SCALE * K / R) is what keeps the tail pinned to the left edge
    // through the whole cycle instead of drifting inward and leaving a gap.
    function computeRamp() {
      rampR = Math.pow(1 / MIN_SCALE, 1 / (visCount - 1));
      rampK = viewW / (1 - MIN_SCALE);
      rampXv = -MIN_SCALE * rampK;
    }

    // Distance of boundary k from the tail edge. Boundary 0 is the head card's
    // outer edge - always at or past the head viewport edge.
    function boundary(k) {
      return rampXv + rampK * Math.pow(rampR, phaseNow() - k);
    }

    // The nearest travel value where image j lands on the head at phase 0
    // (a "landed" state is any whole integer; image = integer mod M).
    function landedForImage(j) {
      const n = ((j % M) + M) % M;
      return n + M * Math.round((travel - n) / M);
    }

    // --- 6. Animation routines ---
    // Every card is ALWAYS rendered. Card i is at slot k = (i - floor(travel))
    // mod M; slots >= visCount sit off-screen (boundary <= 0) and are clipped.
    // Never display-toggled, so the recycle - a card jumping from off one edge
    // to off the other - is an invisible off-screen transform jump either way.
    function positionCards() {
      const shift = Math.floor(travel);
      for (let i = 0; i < M; i++) {
        const card = cards[i];
        const el = card.el;
        const k = (((i - shift) % M) + M) % M;
        const outer = boundary(k);
        const inner = boundary(k + 1);
        const size = Math.max(outer - inner, 1);
        const w = size + OVERLAP;
        // rtl: left edge at inner (distance from the left/tail edge), overlap
        // extends tailward (left). ltr mirrors: left edge at viewW - outer,
        // overlap extends tailward (right, via the width).
        const left = DIRECTION === 'ltr' ? (viewW - outer) : (inner - OVERLAP);
        // Size is driven by transform SCALE off a fixed base frame (never by
        // width/height), so nothing re-rasterizes per frame - the image is
        // rasterized once at `base` px and only composited. transform-origin
        // is the frame's bottom-left, so scale keeps the card on the baseline
        // and grows it rightward from `left`.
        const fscale = w / base;
        el.style.zIndex = String(visCount - k); // head (small k) on top
        el.style.transform = 'translate3d(' + left.toFixed(1) + 'px,0,0) scale(' + fscale.toFixed(5) + ')';

        // Scale parallax (scale-OUT): the image is largest at the head and
        // eases back to 1x toward the tail. Skip it for off-stage cards.
        if (PARALLAX > 0 && k < visCount) {
          const cx = left + w / 2;
          let tailDist = DIRECTION === 'ltr' ? (viewW - cx) / viewW : cx / viewW;
          tailDist = tailDist < 0 ? 0 : tailDist > 1 ? 1 : tailDist;
          const zoom = 1 + PARALLAX * tailDist;
          card.img.style.transform = 'scale(' + zoom.toFixed(4) + ')';
        }
      }
    }

    // Release whatever currently owns travel. The pre-built demo timeline is
    // PAUSED, never killed - killing it would permanently break the Timeline
    // inspector's captured graph; a one-off nav tween is disposable.
    function clearNav() {
      if (!navTween) return;
      if (navTween === demoTl) demoTl.pause();
      else navTween.kill();
      navTween = null;
    }

    // Animate travel to a target (an arrow step or a goTo target). While it
    // runs, frame() hands travel over to this tween so autoplay/drag/scroll
    // don't fight it, and it lands exactly on a whole card.
    function animateTo(target) {
      clearNav();
      const proxy = { t: travel };
      const dur = Math.min(1.1, 0.45 + 0.12 * Math.abs(target - travel));
      navTween = gsap.to(proxy, {
        t: target,
        duration: dur,
        ease: typeof CustomEase !== 'undefined' ? EASE_KEY : 'power3.inOut',
        onUpdate: function () { travel = proxy.t; positionCards(); },
        onComplete: function () { navTween = null; },
      });
    }
    function goForward() { animateTo(Math.round(travel) - 1); }  // autoplay direction
    function goBackward() { animateTo(Math.round(travel) + 1); }
    function goToImage(j) { animateTo(landedForImage(j)); }

    // Timeline inspector demo (ADR-0011): two conveyor steps with a hold
    // between them, PRE-BUILT PAUSED at init so the inspector captures it on
    // load - rows always available, nothing plays until the visitor uses the
    // transport. The conveyor drifts continuously, so every value resolves at
    // PLAY time: the seed call reads the live travel, the step targets are
    // function-based (evaluated when each tween first renders), and the
    // navTween handover only engages while the pass actually runs.
    const demoProxy = { t: 0 };
    const demoTl = gsap.timeline({
      paused: true,
      onComplete: function () { if (navTween === demoTl) navTween = null; },
      onInterrupt: function () { if (navTween === demoTl) navTween = null; },
    });
    (function buildDemo() {
      const ease = typeof CustomEase !== 'undefined' ? EASE_KEY : 'power3.inOut';
      function apply() {
        // re-claim the handover if a drag released it and the visitor then
        // resumed the pass mid-way via the transport
        if (navTween !== demoTl && demoTl.isActive()) navTween = demoTl;
        travel = demoProxy.t;
        positionCards();
      }
      demoTl.call(function () {
        demoProxy.t = travel;
        if (navTween && navTween !== demoTl) navTween.kill();
        navTween = demoTl;
      }, null, 0);
      demoTl.to(demoProxy, {
        t: function () { return Math.round(demoProxy.t) - 1; },
        duration: 0.6, ease: ease, onUpdate: apply,
        data: { label: 'Conveyor advances one card' },
      }, 0.01);
      demoTl.to(demoProxy, {
        t: '+=0', duration: 0.7, ease: 'none',
        data: { label: 'Holds on the featured card' },
      });
      demoTl.to(demoProxy, {
        t: function () { return Math.round(demoProxy.t) - 1; },
        duration: 0.6, ease: ease, onUpdate: apply,
        data: { label: 'Advances to the next card' },
      });
    })();

    function demo() {
      if (navTween && navTween !== demoTl) return null;
      demoTl.restart(true, false);
      return demoTl;
    }

    function frame() {
      if (!running) return;
      const sy = window.scrollY || 0;
      const scrollDelta = sy - scrollY;
      scrollY = sy;
      if (navTween) { dragX = 0; return; } // nav owns travel; its tween renders
      // Scroll feeds a decaying velocity BOOST rather than moving travel 1:1,
      // so the conveyor accelerates on scroll and glides to a stop instead of
      // freezing the instant scrolling stops. Scrolling either direction adds
      // speed the same way (magnitude only), matching autoplay - never reverses.
      scrollBoost = scrollBoost * SCROLL_DAMP + Math.abs(scrollDelta) * SCROLL;
      travel += dragX * DRAG * DRAG_SIGN
        - (reducedMotion ? 0 : AUTOPLAY)
        - scrollBoost;
      dragX = 0;
      positionCards();
    }

    function resize() {
      const w = scene.clientWidth, h = scene.clientHeight;
      if (!w || !h) return;
      viewW = w;
      viewH = h;
      visCount = computeCount();
      computeRamp();
      // Fixed base frame size = the largest a card ever gets, plus parallax
      // headroom so the zoomed image stays sampled from enough pixels. Set on
      // the frames once here (not per frame) so per-frame updates are pure
      // GPU transforms - this is the fix for the autoplay stutter (animating
      // width/height re-rasterized the cover image every frame).
      const maxHero = rampK * (rampR - 1);
      base = (maxHero + OVERLAP) * (1 + PARALLAX);
      const px = base.toFixed(1) + 'px';
      for (let i = 0; i < M; i++) {
        cards[i].el.style.width = px;
        cards[i].el.style.height = px;
      }
      positionCards();
    }

    function initDrag() {
      if (typeof Draggable === 'undefined') return;
      const proxy = document.createElement('div');
      drag = Draggable.create(proxy, {
        type: 'x',
        trigger: scene,
        inertia: typeof InertiaPlugin !== 'undefined',
        allowContextMenu: true,
        dragClickables: true,
        onDragStart: function () { clearNav(); },
        onDrag: function () { dragX += this.deltaX; },
        onThrowUpdate: function () { dragX += this.deltaX; },
      })[0];
    }

    // --- 7. Event listeners ---
    function onKeydown(e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); (DIRECTION === 'ltr' ? goBackward : goForward)(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); (DIRECTION === 'ltr' ? goForward : goBackward)(); }
    }
    container.setAttribute('tabindex', container.getAttribute('tabindex') || '0');
    container.addEventListener('keydown', onKeydown);

    function onPrev() { goBackward(); }
    function onNext() { goForward(); }
    if (prevBtn) prevBtn.addEventListener('click', onPrev);
    if (nextBtn) nextBtn.addEventListener('click', onNext);

    const ro = new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });
    ro.observe(scene);

    function onVis() { running = !document.hidden; }
    document.addEventListener('visibilitychange', onVis);

    // --- 8. Initial DOM state ---
    const objPos = '50% ' + (FOCUS_Y * 100).toFixed(1) + '%';
    for (let i = 0; i < M; i++) {
      cards[i].img.style.objectPosition = objPos;
      if (RADIUS > 0) cards[i].el.style.borderRadius = RADIUS + 'px';
    }
    resize(); // positions every card (transforms) while still display:none
    for (let i = 0; i < M; i++) cards[i].el.style.display = 'block'; // reveal, already placed
    initDrag();

    // --- 9. Reduced motion ---
    // The ticker still runs so drag + scroll + nav respond; only autoplay is
    // gated above (reducedMotion -> AUTOPLAY contributes 0).
    gsap.ticker.add(frame);
    gsap.ticker.lagSmoothing(0);

    function destroy() {
      running = false;
      gsap.ticker.remove(frame);
      clearTimeout(resizeTimer);
      demoTl.kill();
      if (navTween && navTween !== demoTl) navTween.kill();
      if (drag) drag.kill();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      container.removeEventListener('keydown', onKeydown);
      if (prevBtn) prevBtn.removeEventListener('click', onPrev);
      if (nextBtn) nextBtn.removeEventListener('click', onNext);
    }

    // --- 10. Public API ---
    // next/prev advance the conveyor one card (next = the autoplay direction);
    // goTo animates a specific image index to the featured head.
    return {
      destroy: destroy,
      next: function () { goForward(); },
      prev: function () { goBackward(); },
      goTo: function (j) { goToImage(j); },
      demo: demo,
    };
  }

  function waitForGSAP(cb, attempts) {
    attempts = attempts || 0;
    if (typeof gsap !== 'undefined') { cb(); return; }
    if (attempts < 150) setTimeout(function () { waitForGSAP(cb, attempts + 1); }, 50);
    else console.error('[Annnimate] gsap failed to load');
  }

  waitForGSAP(function () {
    const plugins = [];
    if (typeof CustomEase !== 'undefined') plugins.push(CustomEase);
    if (typeof Draggable !== 'undefined') plugins.push(Draggable);
    if (typeof InertiaPlugin !== 'undefined') plugins.push(InertiaPlugin);
    if (plugins.length) gsap.registerPlugin.apply(gsap, plugins);
    if (typeof CustomEase !== 'undefined') {
      CustomEase.create('annnimate', 'M0,0 C0.3,0.9 0.1,1 1,1');
      CustomEase.create('annnimateInOut', 'M0,0 C0.7,0 0.16,1 1,1');
    }
    const instances = [];
    document.querySelectorAll('[data-anm-scale-slider]').forEach(function (el) {
      const api = initScaleSlider(el);
      if (api) instances.push(api);
    });
    window.Anm = window.Anm || {};
    window.Anm.ScaleSlider = {
      destroy: function () { instances.forEach(function (i) { i.destroy(); }); },
      next: function () { instances.forEach(function (i) { i.next(); }); },
      prev: function () { instances.forEach(function (i) { i.prev(); }); },
      goTo: function (j) { instances.forEach(function (i) { i.goTo(j); }); },
      demo: function () { return instances[0] ? instances[0].demo() : null; },
    };
  });
})();
