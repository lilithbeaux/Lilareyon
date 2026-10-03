(function () {
  'use strict';

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

  function initImageFlyIn(container) {
    if (isDisabledOnViewport(container)) return null;

    // --- 1. Selectors ---
    const stage       = container.querySelector('[data-anm-ifi-stage]');
    const cardEls      = container.querySelectorAll('[data-anm-ifi-card]');
    const content       = container.querySelector('[data-anm-ifi-content]');
    const headline     = container.querySelector('[data-anm-ifi-headline]');
    const support      = container.querySelector('[data-anm-ifi-support]');

    if (!stage || !cardEls.length) return;

    const cards = Array.prototype.slice.call(cardEls);

    // --- 2. Config ---
    const cycleDuration = parseFloat(container.dataset.anmDuration || '10');
    const spawnDepth     = parseFloat(container.dataset.anmDepth || '2000');
    const speed          = parseFloat(container.dataset.anmSpeed || '1');
    const scrollBoostMax = parseFloat(container.dataset.anmScrollBoost || '3.5');
    const panMax          = parseFloat(container.dataset.anmPan || '40');
    const holeBuffer      = parseFloat(container.dataset.anmHoleBuffer || '120');

    // --- 3. Constants ---
    const EXIT_Z          = 400;   // depth at which a card has fully faded on the way out
    const PLATEAU_Z_START = -200;  // opacity reaches 1 by this depth
    const PLATEAU_Z_END   = -80;   // opacity holds at 1 until this depth, then fades early
    const HOLE_X_MAX      = 0.42;  // caps so the exclusion never eats the whole viewport
    const HOLE_Y_MAX      = 0.35;
    const HOLE_SOFT_EDGE  = 80;    // px band outside the zone where cards fade back in
    const VELOCITY_LERP   = 0.06;  // per-frame ease-back for the scroll-velocity boost
    const VELOCITY_DIVISOR = 60;   // px/frame of scroll needed to reach full boost
    const PAN_LERP_DUR    = 1.2;   // seconds, quickTo ease duration - fluid, never twitchy
    const PAN_Y_RATIO     = 0.8;   // vertical pan is slightly smaller than horizontal
    const RESIZE_DEBOUNCE = 150;   // ms

    // --- 4. State ---
    let ticker = null;
    let running = false;
    let reduced = false;
    let isCoarsePointer = false;
    let viewportW = window.innerWidth;
    let viewportH = window.innerHeight;
    let velocityMultiplier = 1;
    let lastScrollY = window.scrollY || window.pageYOffset || 0;
    let quickPanX = null;
    let quickPanY = null;
    let holeXHalfPx = 0;
    let holeYHalfPx = 0;
    let perspectivePx = 1200;
    const cardHalfW = [];
    const cardHalfH = [];
    let split = null;
    let supportSplit = null;
    let revealTl = null;
    let revealTriggerSt = null;
    const cardStates = [];
    const setters = [];

    // --- 5. Helpers ---

    // Smoothstep-style opacity ramp: 0 at spawn, 1 across the plateau, back to 0
    // at exit. Never a linear step - the ramp itself should feel eased.
    function opacityForZ(z) {
      if (z <= -spawnDepth) return 0;
      if (z < PLATEAU_Z_START) {
        const t = (z + spawnDepth) / (PLATEAU_Z_START + spawnDepth);
        return smoothstep(clamp01(t));
      }
      if (z <= PLATEAU_Z_END) return 1;
      if (z < EXIT_Z) {
        const t = (z - PLATEAU_Z_END) / (EXIT_Z - PLATEAU_Z_END);
        return 1 - smoothstep(clamp01(t));
      }
      return 0;
    }

    function smoothstep(t) {
      return t * t * (3 - 2 * t);
    }

    function clamp01(v) {
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }

    // Measure the centre content element and derive the spawn-free zone from
    // its actual rectangle plus the buffer. No content element = no
    // exclusion. Re-run on resize and after fonts load - the box depends on
    // both.
    function measureHole() {
      holeXHalfPx = 0;
      holeYHalfPx = 0;
      if (!content) return;
      const rect = content.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      holeXHalfPx = Math.min(rect.width / 2 + holeBuffer, viewportW * HOLE_X_MAX);
      holeYHalfPx = Math.min(rect.height / 2 + holeBuffer, viewportH * HOLE_Y_MAX);
    }

    // Cache each card's untransformed half size - the spawn test and the
    // per-frame zone fade both need the card EDGES, not just its centre.
    function measureCards() {
      cards.forEach(function (card, i) {
        cardHalfW[i] = card.offsetWidth / 2;
        cardHalfH[i] = card.offsetHeight / 2;
      });
    }

    // Random x/y (as fractions of viewport, -0.5 to 0.5) whose card RECT
    // clears the measured content zone at rest depth.
    function randomScatterPosition(halfW, halfH) {
      let x, y;
      let attempts = 0;
      do {
        x = (Math.random() - 0.5);
        y = (Math.random() - 0.5);
        attempts += 1;
      } while (
        Math.abs(x) * viewportW < holeXHalfPx + halfW &&
        Math.abs(y) * viewportH < holeYHalfPx + halfH &&
        attempts < 12
      );
      return { xFrac: x, yFrac: y };
    }

    function spawnCard(state, delayIntoCycle, i) {
      const pos = randomScatterPosition(cardHalfW[i] || 0, cardHalfH[i] || 0);
      state.xFrac = pos.xFrac;
      state.yFrac = pos.yFrac;
      state.z = -spawnDepth - Math.random() * spawnDepth * 0.25;
      state.startZ = state.z;
      state.progress = delayIntoCycle || 0;
    }

    // How much to dim a card so it never reads on top of the content zone.
    // Works in PROJECTED screen space: the perspective divide pulls far cards
    // toward the centre and the cursor pan shifts the whole field, so a
    // spawn-time test alone cannot keep the zone clear. 0 inside the zone,
    // ramps to 1 across the soft edge just outside it.
    function holeFadeFactor(i, z, panX, panY) {
      if (!holeXHalfPx && !holeYHalfPx) return 1;
      const s = perspectivePx / (perspectivePx - z);
      const state = cardStates[i];
      const projX = (state.xFrac * viewportW + panX) * s;
      const projY = (state.yFrac * viewportH + panY) * s;
      const sepX = Math.abs(projX) - (holeXHalfPx + (cardHalfW[i] || 0) * s);
      const sepY = Math.abs(projY) - (holeYHalfPx + (cardHalfH[i] || 0) * s);
      const sep = Math.max(sepX, sepY);
      return smoothstep(clamp01(sep / HOLE_SOFT_EDGE));
    }

    // --- 6. Animation routines ---

    function buildCardStates() {
      cardStates.length = 0;
      setters.length = 0;
      cards.forEach(function (card, i) {
        const state = {
          xFrac: 0,
          yFrac: 0,
          z: -spawnDepth,
          startZ: -spawnDepth,
          progress: (i / cards.length), // stagger initial phase across the field
        };
        cardStates.push(state);
        spawnCard(state, i / cards.length, i);
        setters.push({
          x: gsap.quickSetter(card, 'x', 'px'),
          y: gsap.quickSetter(card, 'y', 'px'),
          z: gsap.quickSetter(card, 'z', 'px'),
          opacity: gsap.quickSetter(card, 'opacity'),
        });
      });
    }

    // Advance every card's cycle progress by dt (seconds), driven by a single
    // gsap.ticker callback. progress 0->1 maps to z: startZ -> EXIT_Z.
    function tick() {
      if (!running) return;
      const dt = gsap.ticker.deltaRatio(60) / 60;
      const rate = (speed * velocityMultiplier) / cycleDuration;

      // ease the scroll-velocity boost back toward 1 every frame
      velocityMultiplier += (1 - velocityMultiplier) * VELOCITY_LERP;

      const totalTravel = EXIT_Z - (-spawnDepth);

      // Live stage pan - the zone fade must account for it, or panned cards
      // slide over the content.
      const panX = quickPanX ? Number(gsap.getProperty(stage, 'x')) || 0 : 0;
      const panY = quickPanY ? Number(gsap.getProperty(stage, 'y')) || 0 : 0;

      for (let i = 0; i < cardStates.length; i++) {
        const state = cardStates[i];
        state.progress += rate * dt;
        if (state.progress >= 1) {
          spawnCard(state, state.progress - 1, i);
        }
        const z = -spawnDepth + state.progress * totalTravel;
        state.z = z;

        const opacity = opacityForZ(z) * holeFadeFactor(i, z, panX, panY);
        const x = state.xFrac * viewportW;
        const y = state.yFrac * viewportH;

        setters[i].x(x);
        setters[i].y(y);
        setters[i].z(z);
        setters[i].opacity(opacity);
      }
    }

    function startTicker() {
      if (running) return;
      running = true;
      gsap.ticker.add(tick);
    }

    function stopTicker() {
      running = false;
      gsap.ticker.remove(tick);
    }

    // Cursor parallax: pan the stage WITH the pointer (no rotation) - move the
    // cursor left and the field slides further left, like looking around the
    // space. The perspective projection makes near cards shift more than far
    // ones, so depth parallax comes for free. quickTo with a long duration
    // keeps it fluid rather than responsive. The centre content sits outside
    // the stage and never moves.
    function setupParallax() {
      if (isCoarsePointer || reduced || panMax <= 0) return;

      quickPanX = gsap.quickTo(stage, 'x', { duration: PAN_LERP_DUR, ease: 'power3.out' });
      quickPanY = gsap.quickTo(stage, 'y', { duration: PAN_LERP_DUR, ease: 'power3.out' });

      container.addEventListener('pointermove', onPointerMove);
      container.addEventListener('pointerleave', onPointerLeave);
    }

    function onPointerMove(e) {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;  // -1..1
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;  // -1..1

      quickPanX(nx * panMax);
      quickPanY(ny * panMax * PAN_Y_RATIO);
    }

    function onPointerLeave() {
      quickPanX(0);
      quickPanY(0);
    }

    // Ordinary scroll-enter reveal for the headline + support line: line-masked
    // rise via SplitText, house ease. Not an entrance system - a normal section
    // reveal that plays once on scroll-in (or immediately if already in view).
    function buildHeadlineReveal() {
      if (!headline) return;

      if (typeof SplitText !== 'undefined') {
        split = SplitText.create(headline, { type: 'lines', mask: 'lines', linesClass: 'ifi_headline_line' });
        if (support) {
          supportSplit = SplitText.create(support, { type: 'lines', mask: 'lines', linesClass: 'ifi_support_line' });
        }
      }

      const headlineLines = split ? split.lines : [headline];
      const supportLines = supportSplit ? supportSplit.lines : (support ? [support] : []);

      gsap.set(headlineLines, { yPercent: 110, y: 0 });
      if (supportLines.length) gsap.set(supportLines, { yPercent: 110, y: 0 });

      revealTl = gsap.timeline({ paused: true, defaults: { ease: 'annnimate', force3D: true } });
      revealTl.fromTo(headlineLines,
        { yPercent: 110, y: 0 },
        { yPercent: 0, y: 0, duration: 1.1, stagger: 0.08 }
      );
      if (supportLines.length) {
        revealTl.fromTo(supportLines,
          { yPercent: 110, y: 0 },
          { yPercent: 0, y: 0, duration: 0.9, stagger: 0.05 },
          '-=0.6'
        );
      }
    }

    function playHeadlineReveal() {
      if (!revealTl) return;
      revealTl.restart();
    }

    function inFirstViewport() {
      const r = container.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }

    // --- 7. Event listeners ---

    let resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        viewportW = window.innerWidth;
        viewportH = window.innerHeight;
        measureHole();
        measureCards();
        ScrollTrigger.refresh();
      }, RESIZE_DEBOUNCE);
    });

    window.addEventListener('scroll', function () {
      const y = window.scrollY || window.pageYOffset || 0;
      const delta = Math.abs(y - lastScrollY);
      lastScrollY = y;
      if (scrollBoostMax > 0) {
        const boost = 1 + Math.min(delta / VELOCITY_DIVISOR, 1) * (scrollBoostMax - 1);
        velocityMultiplier = Math.max(velocityMultiplier, boost);
      }
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopTicker();
        gsap.globalTimeline.pause();
      } else {
        gsap.globalTimeline.resume();
        if (isIntersecting) startTicker();
      }
    });

    let isIntersecting = true;
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          isIntersecting = entry.isIntersecting;
          if (isIntersecting && !document.hidden) startTicker();
          else stopTicker();
        });
      }, { threshold: 0 });
      io.observe(container);
    }

    // --- 8. Initial DOM state ---
    isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    perspectivePx = parseFloat(getComputedStyle(container).perspective) || 1200;
    measureHole();
    measureCards();
    buildCardStates();
    // The content box grows when the web font arrives - re-measure so late
    // spawns respect the real rectangle.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measureHole(); });
    }
    gsap.set(cards, { force3D: true, willChange: 'transform, opacity' });
    gsap.set(stage, { force3D: true });
    if (content) gsap.set(content, { force3D: true });
    buildHeadlineReveal();
    setupParallax();

    requestAnimationFrame(function () {
      if (inFirstViewport()) {
        playHeadlineReveal();
      } else {
        revealTriggerSt = ScrollTrigger.create({
          trigger: container,
          start: 'top 80%',
          once: true,
          onEnter: playHeadlineReveal,
        });
      }
      ScrollTrigger.refresh();
    });

    if (!reduced) startTicker();

    // --- 9. Reduced motion ---
    gsap.matchMedia().add('(prefers-reduced-motion: reduce)', function () {
      reduced = true;
      stopTicker();
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      gsap.set(stage, { x: 0, y: 0 });

      // Park cards at scattered rest positions, mid-depth, near-full opacity,
      // no drift.
      cards.forEach(function (card, i) {
        const state = cardStates[i];
        const x = state.xFrac * viewportW;
        const y = state.yFrac * viewportH;
        gsap.set(card, { x: x, y: y, z: -200, opacity: 0.9 });
      });

      if (revealTl) revealTl.timeScale(20);
    });

    // --- 10. Public API ---
    return {
      play: function () { startTicker(); playHeadlineReveal(); },
      pause: stopTicker,
      refresh: function () {
        viewportW = window.innerWidth;
        viewportH = window.innerHeight;
        measureHole();
        measureCards();
        buildCardStates();
      },
      kill: function () {
        stopTicker();
        if (revealTl) revealTl.kill();
        if (revealTriggerSt) revealTriggerSt.kill();
        if (split) split.revert();
        if (supportSplit) supportSplit.revert();
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerleave', onPointerLeave);
        if (io) io.disconnect();
      },
    };
  }

  function waitForGSAP(cb, attempts) {
    attempts = attempts || 0;
    if (
      typeof gsap !== 'undefined' &&
      typeof ScrollTrigger !== 'undefined' &&
      typeof SplitText !== 'undefined' &&
      typeof CustomEase !== 'undefined'
    ) { cb(); return; }
    if (attempts < 100) setTimeout(function () { waitForGSAP(cb, attempts + 1); }, 50);
    else console.error('[Annnimate] gsap/ScrollTrigger/SplitText/CustomEase failed to load');
  }

  waitForGSAP(function () {
    gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
    CustomEase.create('annnimate', 'M0,0 C0.3,0.9 0.1,1 1,1');

    const instances = [];
    document.querySelectorAll('[data-anm-image-fly-in]').forEach(function (el) {
      const api = initImageFlyIn(el);
      if (api) instances.push(api);
    });
    window.Anm = window.Anm || {};
    window.Anm.ImageFlyIn = {
      play:    function () { instances.forEach(function (i) { i.play(); }); },
      pause:   function () { instances.forEach(function (i) { i.pause(); }); },
      refresh: function () { instances.forEach(function (i) { i.refresh(); }); },
      kill:    function () { instances.forEach(function (i) { i.kill(); }); },
    };
  });
})();
