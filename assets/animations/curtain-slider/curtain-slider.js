(function () {
  'use strict';

  // Curtain Slider - full-bleed drop-in image slider. Each slide is built
  // from N vertical column strips (stage-congruent inners, so the cover-fit
  // photo reassembles seamlessly). Advancing wipes the OUTGOING slide's
  // columns away IN PLACE: each column's clip edge sweeps sideways (side
  // and stagger both follow travel direction) - the curtain - revealing the
  // incoming slide zoom-settling beneath. Per-slide title/label/index roll
  // via masked chars. House pill navigation + drag/swipe + keyboard +
  // optional auto-advance.

  function initCurtainSlider(container) {
    // --- 1. Selectors ---
    const stage = container.querySelector('[data-anm-cs-stage]');
    const slideEls = Array.prototype.slice.call(container.querySelectorAll('[data-anm-cs-slide]'));

    if (!stage || !slideEls.length) return null;
    if (isDisabledOnViewport(container)) return null;

    // --- 2. Config ---
    const duration = parseFloat(container.dataset.anmDuration || '1.1');
    const easeName = container.dataset.anmEase || 'annnimate';
    const columns = Math.max(2, Math.min(24, parseInt(container.dataset.anmColumns || '12', 10) || 12));
    const autoSeconds = parseFloat(container.dataset.anmAuto || '0');
    const dragEnabled = container.dataset.anmDrag !== 'false';
    const charStagger = parseFloat(container.dataset.anmStagger || '0.0125');
    const ease = typeof CustomEase !== 'undefined' && (easeName === 'annnimate' || easeName === 'annnimateInOut')
      ? easeName
      : (easeName || 'expo.out');

    // --- 3. Constants ---
    const STRIP_DUR_RATIO = 0.62;   // each column's exit as a fraction of duration;
                                    // the rest of the duration is the stagger spread
    // Dimming runs on per-strip black shade overlays tweening OPACITY, never
    // on filter: brightness() - animated filters repaint every frame and
    // churn compositor layers (flashing-rectangle flicker at fullscreen
    // retina + high refresh). Opacity composites on the GPU.
    const INCOMING_SHADE = 0.18;    // incoming starts under a light shade, clears to 0
    const OUT_SHADE = 0.3;          // outgoing strips darken as they wipe away
    const ZOOM_FROM = 1.3;      // incoming zoom-settle start (the wipe-slider move)
    const TITLE_OUT_DUR = 0.55;
    const TITLE_IN_DUR = 0.95;
    const LABEL_DUR = 0.5;
    const DIGIT_DUR = 0.7;
    const BAR_DUR = duration * 0.8;
    const SWIPE_THRESHOLD_RATIO = 0.15; // fraction of stage size to commit a drag
    const ARROW_HOVER_DUR = 0.35;
    const ARROW_PRESS_DUR = 0.15;
    const AUTO_RESUME_DELAY = 4; // seconds of no interaction before auto-advance resumes

    // --- 4. State ---
    const slides = slideEls.map(function (el) {
      const img = el.querySelector('img');
      return {
        title: el.dataset.title || '',
        label: el.dataset.label || '',
        src: img ? img.currentSrc || img.src : '',
        alt: img ? img.alt || '' : '',
      };
    });

    let currentIndex = 0;
    let refs = null;
    let zTop = 0;
    let goToSeq = 0;
    let inFlight = null;
    let lastGoTo = 0;
    let dragStart = 0;
    let dragActive = false;
    let dragAxisSize = 1;
    let autoTimer = null;
    let reducedMotion = false;

    // --- 5. Helpers ---

    // Standard viewport gate: data-anm-disable="mobile,tablet,desktop".
    function isDisabledOnViewport(el) {
      const disable = el.dataset.anmDisable;
      if (!disable) return false;
      const breakpoints = {
        mobile: '(max-width: 479px)',
        tablet: '(max-width: 991px)',
        landscape: '(orientation: landscape) and (max-width: 767px)',
        desktop: '(min-width: 992px)',
      };
      return disable.split(',').some(function (v) {
        const q = breakpoints[v.trim()];
        return q && window.matchMedia(q).matches;
      });
    }

    function indexLabel(i) {
      return String(i + 1).padStart(2, '0');
    }

    function buildCharLine(text, lineClass, charClass) {
      const line = document.createElement('span');
      line.className = lineClass;
      text.split('').forEach(function (ch) {
        const span = document.createElement('span');
        span.className = charClass;
        // inline-block char spans collapse a plain space to zero width -
        // swap word gaps for a non-breaking space so they keep their width
        span.textContent = ch === ' ' ? '\xA0' : ch;
        line.appendChild(span);
      });
      return line;
    }

    function splitChars(el, text, lineClass, charClass) {
      el.innerHTML = '';
      const line = buildCharLine(text, lineClass, charClass);
      el.appendChild(line);
      return Array.from(line.querySelectorAll('.' + charClass));
    }

    // Swap masked char content without clearing the element: the outgoing
    // line is lifted onto an absolute overlay (its own mask keeps clipping)
    // and removed only when its exit tween completes, so both the out and
    // the in animation always run to the end.
    function swapChars(el, newText, lineClass, charClass, outVars, inVars) {
      const oldLine = el.querySelector('.' + lineClass + ':not(.cs_line_out)');
      if (oldLine) {
        oldLine.classList.add('cs_line_out');
        const oldChars = oldLine.querySelectorAll('.' + charClass);
        gsap.to(oldChars, Object.assign({
          onComplete: function () { oldLine.remove(); },
        }, outVars));
      }
      const line = buildCharLine(newText, lineClass, charClass);
      el.appendChild(line);
      const chars = Array.from(line.querySelectorAll('.' + charClass));
      // Park FIRST via set: a delayed fromTo does NOT immediateRender, so the
      // incoming line would sit visible at rest during the delay and "jump".
      gsap.set(chars, inVars.from);
      gsap.to(chars, inVars.to);
      return chars;
    }

    function buildDigitColumn(digitChar) {
      const wrap = document.createElement('span');
      wrap.className = 'cs_digit_wrap';
      const roller = document.createElement('span');
      roller.className = 'cs_digit_roller';
      for (let d = 0; d <= 9; d++) {
        const s = document.createElement('span');
        s.textContent = String(d);
        roller.appendChild(s);
      }
      wrap.appendChild(roller);
      wrap._digit = parseInt(digitChar, 10);
      wrap._roller = roller;
      return wrap;
    }

    function setIndexDisplay(el, valueString) {
      el.innerHTML = '';
      valueString.split('').forEach(function (ch) {
        const col = buildDigitColumn(ch);
        gsap.set(col._roller, { y: -col._digit + 'em' });
        el.appendChild(col);
      });
      const divider = document.createElement('span');
      divider.className = 'cs_index_divider';
      divider.textContent = '/';
      el.appendChild(divider);
      const total = document.createElement('span');
      total.className = 'cs_index_total';
      total.textContent = indexLabel(slides.length - 1);
      el.appendChild(total);
    }

    function rollIndex(el, value) {
      const cols = Array.from(el.querySelectorAll('.cs_digit_wrap'));
      value.split('').forEach(function (d, i) {
        const col = cols[i];
        if (!col) return;
        const target = parseInt(d, 10);
        col._digit = target;
        gsap.to(col._roller, {
          y: -target + 'em',
          duration: DIGIT_DUR,
          ease: 'expo.inOut',
          force3D: true,
          overwrite: true,
        });
      });
    }

    // Each layer is built from COLUMNS strips: an overflow-hidden mask with a
    // stage-congruent inner (the inner is exactly the stage rect, offset so
    // the strips reassemble the full cover-fit photo). Strip edges are
    // integer-snapped pixels, and every strip except the last OVERLAPS its
    // right neighbor by 1px: under a fractional effective scale (preview
    // scale-to-fit, browser zoom, odd dpr) exactly-tiled edges antialias
    // against the stage and leak hairline seams between columns. The inner is
    // stage-congruent, so the overlapped pixel renders identical image
    // content - invisible, but the seam can never open.
    function layoutStrips() {
      const w = stage.clientWidth || 1;
      const edges = [];
      for (let c = 0; c <= columns; c++) edges.push(Math.round((c * w) / columns));
      refs.layerParts.forEach(function (parts) {
        for (let c = 0; c < columns; c++) {
          const strip = parts.strips[c];
          const inner = parts.inners[c];
          const overlap = c < columns - 1 ? 1 : 0;
          strip.style.left = edges[c] + 'px';
          strip.style.width = (edges[c + 1] - edges[c] + overlap) + 'px';
          inner.style.left = (-edges[c]) + 'px';
          inner.style.width = w + 'px';
        }
      });
    }

    function setLayerVisible(layer, visible) {
      layer.style.visibility = visible ? '' : 'hidden';
    }

    // A clip edge is antialiased even at inset(0) and leaks a hairline of
    // the layer beneath - settled strips must carry NO clip at all.
    function clearStripClips(parts) {
      for (let s = 0; s < parts.strips.length; s++) {
        parts.strips[s].style.clipPath = 'none';
        parts.strips[s].style.removeProperty('--csc');
      }
    }

    // --- 6. Animation routines ---

    function buildStage() {
      stage.innerHTML = '';

      const layerWrap = document.createElement('div');
      layerWrap.className = 'cs_layers';
      const layerParts = [];
      const layers = slides.map(function (slide, i) {
        const layer = document.createElement('div');
        layer.className = 'cs_layer';
        layer.style.zIndex = String(i);
        layer.style.visibility = i === currentIndex ? '' : 'hidden';
        const parts = { strips: [], inners: [], imgs: [], shades: [] };
        for (let c = 0; c < columns; c++) {
          const strip = document.createElement('div');
          strip.className = 'cs_strip';
          const inner = document.createElement('div');
          inner.className = 'cs_strip_inner';
          const img = document.createElement('img');
          img.className = 'cs_layer_img';
          img.src = slide.src;
          img.alt = c === 0 ? slide.alt : '';
          img.loading = 'eager';
          const shade = document.createElement('div');
          shade.className = 'cs_shade';
          shade.setAttribute('aria-hidden', 'true');
          inner.appendChild(img);
          strip.appendChild(inner);
          strip.appendChild(shade);
          layer.appendChild(strip);
          parts.strips.push(strip);
          parts.inners.push(inner);
          parts.imgs.push(img);
          parts.shades.push(shade);
        }
        layerParts.push(parts);
        layerWrap.appendChild(layer);
        return layer;
      });

      const scrim = document.createElement('div');
      scrim.className = 'cs_scrim';
      scrim.setAttribute('aria-hidden', 'true');

      const labelEl = document.createElement('div');
      labelEl.className = 'cs_label';

      const titleEl = document.createElement('h2');
      titleEl.className = 'cs_title';

      const indexEl = document.createElement('div');
      indexEl.className = 'cs_index';
      indexEl.setAttribute('aria-hidden', 'true');

      const progress = document.createElement('div');
      progress.className = 'cs_progress';
      progress.setAttribute('aria-hidden', 'true');
      const progressFill = document.createElement('div');
      progressFill.className = 'cs_progress_fill';
      progress.appendChild(progressFill);

      const pill = document.createElement('div');
      pill.className = 'cs_pill';
      pill.setAttribute('role', 'group');
      pill.setAttribute('aria-label', 'Slide controls');

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'cs_arrow';
      prevBtn.setAttribute('aria-label', 'Previous slide');
      prevBtn.innerHTML = '<svg class="cs_arrow_icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'cs_arrow';
      nextBtn.setAttribute('aria-label', 'Next slide');
      nextBtn.innerHTML = '<svg class="cs_arrow_icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      pill.appendChild(prevBtn);
      pill.appendChild(nextBtn);

      const liveRegion = document.createElement('div');
      liveRegion.className = 'cs_live';
      liveRegion.setAttribute('aria-live', 'polite');

      stage.appendChild(layerWrap);
      stage.appendChild(scrim);
      stage.appendChild(labelEl);
      stage.appendChild(titleEl);
      stage.appendChild(indexEl);
      stage.appendChild(progress);
      stage.appendChild(pill);
      stage.appendChild(liveRegion);

      refs = {
        layers: layers,
        layerParts: layerParts,
        labelEl: labelEl,
        titleEl: titleEl,
        indexEl: indexEl,
        progressFill: progressFill,
        prevBtn: prevBtn,
        nextBtn: nextBtn,
        liveRegion: liveRegion,
      };

      layoutStrips();
      settleCurrent();
      return { prevBtn: prevBtn, nextBtn: nextBtn };
    }

    function settleCurrent() {
      const slide = slides[currentIndex];

      const titleChars = splitChars(refs.titleEl, slide.title, 'cs_title_line', 'cs_title_char');
      gsap.set(titleChars, { yPercent: 0, y: 0 });

      const labelChars = splitChars(refs.labelEl, slide.label, 'cs_label_line', 'cs_title_char');
      gsap.set(labelChars, { yPercent: 0, y: 0 });

      setIndexDisplay(refs.indexEl, indexLabel(currentIndex));

      gsap.set(refs.progressFill, {
        scaleX: (currentIndex + 1) / slides.length,
        transformOrigin: 'left center',
      });

      announce();
    }

    function announce() {
      refs.liveRegion.textContent = 'Slide ' + (currentIndex + 1) + ' of ' + slides.length + ': ' + slides[currentIndex].title;
    }

    function animateArrowHover(btn, dir) {
      const icon = btn.querySelector('.cs_arrow_icon');
      btn.addEventListener('mouseenter', function () {
        gsap.to(icon, { x: dir * 3, duration: ARROW_HOVER_DUR, ease: 'back.out(2)', overwrite: 'auto', force3D: true });
      });
      btn.addEventListener('mouseleave', function () {
        gsap.to(icon, { x: 0, duration: ARROW_HOVER_DUR, ease: 'expo.out', overwrite: 'auto', force3D: true });
      });
      btn.addEventListener('pointerdown', function () {
        gsap.to(btn, { scale: 0.92, duration: ARROW_PRESS_DUR, ease: 'power2.out', overwrite: 'auto', force3D: true });
      });
      btn.addEventListener('pointerup', function () {
        gsap.to(btn, { scale: 1, duration: ARROW_PRESS_DUR, ease: 'back.out(2.5)', overwrite: 'auto', force3D: true });
      });
      btn.addEventListener('pointerleave', function () {
        gsap.to(btn, { scale: 1, duration: ARROW_PRESS_DUR, ease: 'power2.out', overwrite: 'auto', force3D: true });
      });
    }

    // direction: 1 = next, -1 = prev
    function goTo(newIndex, direction) {
      if (newIndex === currentIndex) return;
      const now = performance.now();
      if (now - lastGoTo < 150) return;
      lastGoTo = now;

      // Reversing onto the slide that is mid-demotion: snap the in-flight
      // transition to done first so re-clipping it never flashes the stage.
      if (inFlight && newIndex === inFlight.outIndex) {
        inFlight.tl.progress(1);
        inFlight = null;
      }

      const outIndex = currentIndex;
      currentIndex = newIndex;
      const slide = slides[newIndex];

      const seq = ++goToSeq;
      const tl = gsap.timeline({
        onComplete: function () { if (inFlight && inFlight.tl === tl) inFlight = null; },
      });
      inFlight = { tl: tl, outIndex: outIndex };

      // --- background layers: the OUTGOING slide's columns exit through
      // their strip masks with a travel-signed stagger (the curtain), while
      // the incoming slide sits whole beneath, zoom-settling + brightening.
      const outLayer = refs.layers[outIndex];
      const inLayer = refs.layers[newIndex];
      const outParts = refs.layerParts[outIndex];
      const inParts = refs.layerParts[newIndex];

      // outgoing rides ON TOP of the incoming; monotonically increasing
      // pairs keep the newest transition's stack order under spam
      zTop += 2;
      outLayer.style.zIndex = String(slides.length + zTop + 1);
      inLayer.style.zIndex = String(slides.length + zTop);
      setLayerVisible(outLayer, true);
      setLayerVisible(inLayer, true);

      // an interrupted exit can leave partial clips on the layer that is now
      // incoming - clear them before it shows whole beneath the curtain
      gsap.killTweensOf(inParts.strips);
      gsap.killTweensOf(inParts.shades);
      gsap.killTweensOf(inLayer);
      clearStripClips(inParts);
      // Zoom the LAYER, not the 12 imgs inside it: scaling twelve
      // stage-sized dpr2 textures per frame forces compositor re-rasters
      // (checkerboard-rectangle flicker on 120Hz retina); one layer
      // transform is compositor-cheap and visually identical while the
      // incoming plate is unclipped.
      gsap.set(inLayer, { scale: ZOOM_FROM, transformOrigin: '50% 50%', force3D: true });
      gsap.set(inParts.shades, { opacity: INCOMING_SHADE });

      const stripDur = duration * STRIP_DUR_RATIO;
      const stripStagger = (duration - stripDur) / Math.max(1, columns - 1);

      // The curtain: every outgoing column stays in place while its clip
      // edge wipes sideways, staggered across the row. The wipe side and
      // the stagger both follow travel: next wipes + staggers left -> right,
      // prev right -> left. Only the inset SIDE is a static template - the
      // tween drives the single --csc var (never tween inset strings - they
      // collapse and freeze).
      gsap.killTweensOf(outParts.strips);
      for (let s = 0; s < outParts.strips.length; s++) {
        outParts.strips[s].style.clipPath = direction > 0
          ? 'inset(0% 0% 0% var(--csc, 0%))'
          : 'inset(0% var(--csc, 0%) 0% 0%)';
      }
      gsap.set(outParts.strips, { '--csc': '0%' });
      // target overshoots 100%: the drift ease spends its long tail on the
      // last ~1% of distance, which parks a 1px antialiased sliver at the
      // column edge until the tween ends (it reads as a flicker). Crossing
      // the visually-empty point at 100% mid-ease kills the sliver while
      // the tail plays out invisibly (an inset past 100% renders nothing).
      tl.to(outParts.strips, {
        '--csc': '105%',
        duration: stripDur,
        ease: ease,
        stagger: direction > 0 ? stripStagger : -stripStagger,
        overwrite: true,
        data: { label: 'Curtain columns wipe away' },
      }, 0);
      gsap.killTweensOf(outParts.shades);
      tl.to(outParts.shades, {
        opacity: OUT_SHADE,
        duration: stripDur * 0.8,
        ease: 'power1.in',
        stagger: direction > 0 ? stripStagger : -stripStagger,
        overwrite: 'auto',
        data: { label: 'Outgoing slide dims' },
      }, 0);

      // incoming settles underneath for the full transition length
      tl.to(inLayer, {
        scale: 1,
        duration: duration * 1.05,
        ease: ease,
        force3D: true,
        data: { label: 'Incoming plate zoom-settles' },
      }, 0);
      tl.to(inParts.shades, {
        opacity: 0,
        duration: duration * 1.05,
        ease: ease,
        data: { label: 'Incoming brightens to full' },
      }, 0);

      tl.call(function () {
        // Only the newest transition may settle the stage: under spam, an
        // older tl completing late would otherwise restack layers a newer
        // transition is actively using.
        if (seq !== goToSeq) return;
        refs.layers.forEach(function (layer, i) {
          const parts = refs.layerParts[i];
          gsap.killTweensOf(parts.strips);
          gsap.killTweensOf(parts.shades);
          gsap.killTweensOf(layer);
          clearStripClips(parts);
          gsap.set(layer, { scale: 1 });
          gsap.set(parts.shades, { opacity: 0 });
          setLayerVisible(layer, i === newIndex);
          layer.style.zIndex = i === newIndex ? String(slides.length) : String(i);
        });
      }, null, duration);

      // --- texts: outgoing chars keep animating on an overlay line while the
      // incoming line staggers in - both always complete. ---
      swapChars(refs.titleEl, slide.title, 'cs_title_line', 'cs_title_char', {
        yPercent: direction > 0 ? -120 : 120,
        y: 0,
        duration: TITLE_OUT_DUR,
        ease: 'annnimateInOut',
        stagger: direction > 0 ? charStagger : -charStagger,
        force3D: true,
        overwrite: true,
      }, {
        from: { yPercent: direction > 0 ? 120 : -120, y: 0 },
        to: { yPercent: 0, y: 0, duration: TITLE_IN_DUR, ease: 'annnimateInOut', stagger: direction > 0 ? charStagger : -charStagger, force3D: true, overwrite: true },
      });

      swapChars(refs.labelEl, slide.label, 'cs_label_line', 'cs_title_char', {
        yPercent: direction > 0 ? -110 : 110,
        y: 0,
        duration: LABEL_DUR * 0.7,
        ease: 'annnimateInOut',
        force3D: true,
        overwrite: true,
      }, {
        from: { yPercent: direction > 0 ? 110 : -110, y: 0 },
        to: { yPercent: 0, y: 0, duration: LABEL_DUR, ease: 'annnimateInOut', force3D: true, overwrite: true },
      });

      rollIndex(refs.indexEl, indexLabel(newIndex));

      gsap.set(refs.progressFill, { transformOrigin: 'left center' });
      tl.to(refs.progressFill, {
        scaleX: (newIndex + 1) / slides.length,
        duration: BAR_DUR,
        ease: ease,
        force3D: true,
        overwrite: 'auto',
        data: { label: 'Progress bar advances' },
      }, 0);

      announce();
    }

    function next() {
      const i = (currentIndex + 1) % slides.length;
      goTo(i, 1);
    }

    function prev() {
      const i = (currentIndex - 1 + slides.length) % slides.length;
      goTo(i, -1);
    }

    // --- 7. Event listeners ---

    const { prevBtn, nextBtn } = buildStage();

    prevBtn.addEventListener('click', function () { prev(); armAutoResume(); });
    nextBtn.addEventListener('click', function () { next(); armAutoResume(); });
    animateArrowHover(prevBtn, -1);
    animateArrowHover(nextBtn, 1);

    function handleKeydown(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next(); armAutoResume(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { prev(); armAutoResume(); }
    }
    container.setAttribute('tabindex', container.getAttribute('tabindex') || '0');
    container.addEventListener('keydown', handleKeydown);

    function handlePointerDown(e) {
      if (!dragEnabled) return;
      if (e.target.closest('.cs_pill')) { dragActive = false; return; }
      dragActive = true;
      dragStart = e.clientX;
      dragAxisSize = stage.clientWidth;
    }
    function handlePointerUp(e) {
      if (!dragActive) return;
      dragActive = false;
      const pos = e.clientX;
      const delta = pos - dragStart;
      const threshold = dragAxisSize * SWIPE_THRESHOLD_RATIO;
      if (Math.abs(delta) < threshold) return;
      if (delta < 0) next(); else prev();
      armAutoResume();
    }
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);

    function stopAuto() {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }
    function startAuto() {
      stopAuto();
      if (autoSeconds > 0 && !reducedMotion) {
        autoTimer = setInterval(next, autoSeconds * 1000);
      }
    }
    let resumeTimer = null;
    function armAutoResume() {
      if (autoSeconds <= 0) return;
      stopAuto();
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(startAuto, AUTO_RESUME_DELAY * 1000);
    }
    container.addEventListener('mouseenter', stopAuto);
    container.addEventListener('mouseleave', startAuto);
    container.addEventListener('focusin', stopAuto);
    container.addEventListener('focusout', startAuto);

    // --- 8. Initial DOM state ---
    container.setAttribute('role', 'region');
    container.setAttribute('aria-roledescription', 'carousel');
    container.setAttribute('aria-label', slides[currentIndex].title);

    // --- 9. Reduced motion ---
    gsap.matchMedia().add('(prefers-reduced-motion: reduce)', function () {
      reducedMotion = true;
      gsap.globalTimeline.timeScale(20);
    });

    // --- 10. Public API ---

    let resizeTimer = null;
    function handleResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        // strip edges are integer-snapped pixels - re-derive on every resize
        layoutStrips();
      }, 150);
    }
    window.addEventListener('resize', handleResize);

    function handleVisibility() {
      if (document.hidden) { gsap.globalTimeline.pause(); stopAuto(); }
      else { gsap.globalTimeline.resume(); startAuto(); }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    startAuto();

    return {
      refresh: function () { settleCurrent(); },
      next: function () { next(); armAutoResume(); },
      prev: function () { prev(); armAutoResume(); },
      goTo: function (i) {
        if (i === currentIndex || i < 0 || i >= slides.length) return;
        goTo(i, i > currentIndex ? 1 : -1);
        armAutoResume();
      },
      // Timeline inspector demo (ADR-0011): one advance - a slider's idle
      // state is whichever slide it shows. Returns the transition timeline.
      demo: function () {
        next();
        return inFlight ? inFlight.tl : null;
      },
      kill: function () {
        stopAuto();
        clearTimeout(resumeTimer);
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibility);
        container.removeEventListener('keydown', handleKeydown);
        container.removeEventListener('pointerdown', handlePointerDown);
        container.removeEventListener('pointerup', handlePointerUp);
      },
    };
  }

  function waitForGSAP(cb, attempts) {
    attempts = attempts || 0;
    const ready = typeof gsap !== 'undefined' && typeof CustomEase !== 'undefined';
    if (ready) { cb(); return; }
    if (attempts < 100) setTimeout(function () { waitForGSAP(cb, attempts + 1); }, 50);
    else console.error('[Annnimate] gsap/CustomEase failed to load');
  }

  waitForGSAP(function () {
    gsap.registerPlugin(CustomEase);
    CustomEase.create('annnimate', 'M0,0 C0.3,0.9 0.1,1 1,1');
    CustomEase.create('annnimateInOut', 'M0,0 C0.7,0 0.16,1 1,1');

    const instances = [];
    document.querySelectorAll('[data-anm-curtain-slider]').forEach(function (el) {
      const api = initCurtainSlider(el);
      if (api) instances.push(api);
    });
    window.Anm = window.Anm || {};
    window.Anm.CurtainSlider = {
      refresh: function () { instances.forEach(function (i) { i.refresh(); }); },
      next: function () { instances.forEach(function (i) { i.next(); }); },
      prev: function () { instances.forEach(function (i) { i.prev(); }); },
      goTo: function (i) { instances.forEach(function (inst) { inst.goTo(i); }); },
      demo: function () { return instances[0] ? instances[0].demo() : null; },
    };
  });
})();
