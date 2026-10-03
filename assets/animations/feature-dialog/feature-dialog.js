(function () {
  'use strict';

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

  function initFeatureDialog(container) {
    if (isDisabledOnViewport(container)) return null;

    // --- 1. Selectors ---
    const tile = container.querySelector('[data-anm-fdg-tile]');
    const toggleEl = container.querySelector('[data-anm-fdg-toggle]');
    const overlay = container.querySelector('[data-anm-fdg-overlay]');
    const modal = container.querySelector('[data-anm-fdg-modal]');
    const gradient = container.querySelector('[data-anm-fdg-gradient]');
    const sheet = container.querySelector('[data-anm-fdg-sheet]');
    const closeBtn = container.querySelector('[data-anm-fdg-close]');
    const titleInner = container.querySelector('[data-anm-fdg-title]');
    const glyphTR = toggleEl ? toggleEl.querySelector('.fdg_glyph_tr') : null;
    const glyphBL = toggleEl ? toggleEl.querySelector('.fdg_glyph_bl') : null;

    if (!tile || !toggleEl || !overlay || !modal || !sheet || !closeBtn) return null;

    // --- 2. Config ---
    const duration = parseFloat(container.dataset.anmDuration || '0.55');
    const ease = container.dataset.anmEase || 'annnimate';

    // --- 3. Constants ---
    const OPEN_CLASS = 'is-open';
    // Overlay tint + blur endpoints. Element opacity stays 1 the whole time -
    // fading a backdrop-filter element's own opacity washes the blur out.
    const OVERLAY_TINT = 'rgba(10, 10, 10, 0.2)';
    const OVERLAY_TINT_OFF = 'rgba(10, 10, 10, 0)';
    const OVERLAY_BLUR = '6px';
    const ENTER_DISTANCE = 128;
    // The exit is its own, quicker leg: half the travel, dropping away.
    const EXIT_DISTANCE = 64;
    // Hover micro-move: the two corner arrows spread outward (SVG user units).
    const HOVER_SHIFT = 1.75;
    const HOVER_DUR = 0.4;
    const TITLE_NAME = titleInner ? (titleInner.textContent || 'details').trim() : 'details';

    // --- 4. State ---
    let isOpen = false;
    let scrollLocked = false;
    let liveTl = null;

    // --- 5. Helpers ---
    function lockScroll() {
      if (scrollLocked) return;
      scrollLocked = true;
      document.body.style.overflow = 'hidden';
    }

    function unlockScroll() {
      if (!scrollLocked) return;
      scrollLocked = false;
      document.body.style.overflow = '';
    }

    function setOpenAria(open) {
      toggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
      sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) sheet.removeAttribute('inert');
      else sheet.setAttribute('inert', '');
    }

    // --- 6. Animation routines ---
    // Open and close are deliberately ASYMMETRIC (different travel and speed),
    // so they are paired builds rather than one reversed timeline. Every
    // tween is a .to() from the LIVE values, and killLive() stops whatever is
    // in flight first - that is what makes rapid open/close interruptible.
    function killLive() {
      if (liveTl) { liveTl.kill(); liveTl = null; }
      gsap.killTweensOf([overlay, modal, gradient].filter(Boolean));
    }

    function onOpenSettle() {
      liveTl = null;
      if (document.hasFocus()) closeBtn.focus();
    }

    function onCloseSettle() {
      liveTl = null;
      unlockScroll();
      container.classList.remove(OPEN_CLASS);
      // Re-park for the next enter while invisible: the exit only travelled
      // half the enter distance, so the enter start position is reset here.
      gsap.set(modal, { y: ENTER_DISTANCE });
      if (gradient) gsap.set(gradient, { yPercent: 30 });
      if (document.hasFocus()) toggleEl.focus();
    }

    function openSheet() {
      if (isOpen) return liveTl;
      isOpen = true;
      killLive();
      container.classList.add(OPEN_CLASS);
      setOpenAria(true);
      lockScroll();
      sheet.scrollTop = 0;
      const tl = gsap.timeline({
        defaults: { ease: ease, force3D: true },
        onComplete: onOpenSettle,
      });
      tl.to(overlay, {
        '--fdg-blur': OVERLAY_BLUR, backgroundColor: OVERLAY_TINT,
        duration: duration * 0.6,
        data: { label: 'Page dims and blurs behind' },
      }, 0);
      tl.to(modal, {
        y: 0, duration: duration,
        data: { label: 'Dialog rises into place' },
      }, 0);
      tl.to(modal, {
        autoAlpha: 1, duration: duration * 0.45,
        data: { label: 'Dialog fades in fast' },
      }, 0);
      if (gradient) {
        tl.to(gradient, {
          yPercent: 0, autoAlpha: 1, duration: duration * 0.9,
          data: { label: 'Gradient band drifts up and fades in' },
        }, 0.1);
      }
      liveTl = tl;
      return tl;
    }

    function closeSheet() {
      if (!isOpen) return liveTl;
      isOpen = false;
      killLive();
      setOpenAria(false);
      const tl = gsap.timeline({
        defaults: { ease: 'annnimateInOut', force3D: true },
        onComplete: onCloseSettle,
      });
      tl.to(modal, {
        y: EXIT_DISTANCE, duration: duration * 0.4,
        data: { label: 'Dialog drops away' },
      }, 0);
      tl.to(modal, {
        autoAlpha: 0, duration: duration * 0.32,
        data: { label: 'Dialog fades out' },
      }, 0);
      tl.to(overlay, {
        '--fdg-blur': '0px', backgroundColor: OVERLAY_TINT_OFF,
        duration: duration * 0.4,
        data: { label: 'Page sharpens again' },
      }, 0);
      if (gradient) {
        tl.to(gradient, {
          yPercent: 30, autoAlpha: 0, duration: duration * 0.35,
          data: { label: 'Gradient band sinks out' },
        }, 0);
      }
      liveTl = tl;
      return tl;
    }

    function toggleSheet() { return isOpen ? closeSheet() : openSheet(); }

    function glyphsOut() {
      if (!glyphTR || !glyphBL) return;
      gsap.to(glyphTR, { x: HOVER_SHIFT, y: -HOVER_SHIFT, duration: HOVER_DUR, ease: 'annnimateInOut', overwrite: 'auto' });
      gsap.to(glyphBL, { x: -HOVER_SHIFT, y: HOVER_SHIFT, duration: HOVER_DUR, ease: 'annnimateInOut', overwrite: 'auto' });
    }

    function glyphsHome() {
      if (!glyphTR || !glyphBL) return;
      gsap.to([glyphTR, glyphBL], { x: 0, y: 0, duration: HOVER_DUR, ease: 'annnimateInOut', overwrite: 'auto' });
    }

    // --- 7. Event listeners ---
    tile.addEventListener('click', function () {
      if (!isOpen) openSheet();
    });
    tile.addEventListener('mouseenter', glyphsOut);
    tile.addEventListener('mouseleave', glyphsHome);
    tile.addEventListener('keydown', function (e) {
      if (isOpen) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openSheet();
      }
    });
    toggleEl.addEventListener('click', function (e) {
      e.stopPropagation();
      openSheet();
    });
    closeBtn.addEventListener('click', function () {
      closeSheet();
    });
    modal.addEventListener('click', function (e) {
      if (isOpen && !sheet.contains(e.target)) closeSheet();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) closeSheet();
      // Focus trap: while open the sheet is a modal dialog, so Tab cycles
      // within it instead of escaping to the page behind.
      if (e.key === 'Tab' && isOpen) {
        const focusables = sheet.querySelectorAll(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!sheet.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) gsap.globalTimeline.pause();
      else gsap.globalTimeline.resume();
    });

    // --- 8. Initial DOM state ---
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('aria-haspopup', 'dialog');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', TITLE_NAME);
    setOpenAria(false);
    gsap.set(overlay, { '--fdg-blur': '0px', backgroundColor: OVERLAY_TINT_OFF });
    gsap.set(modal, { y: ENTER_DISTANCE, autoAlpha: 0 });
    if (gradient) gsap.set(gradient, { yPercent: 30, autoAlpha: 0 });

    // --- 9. Reduced motion ---
    gsap.matchMedia().add('(prefers-reduced-motion: reduce)', function () {
      gsap.globalTimeline.timeScale(20);
    });

    // --- 10. Public API ---
    return {
      open: openSheet,
      close: closeSheet,
      toggle: toggleSheet,
      // Timeline inspector demo (ADR-0011): one open -> close pass, ending
      // back in the closed idle state. setTimeout, not gsap.delayedCall -
      // reduced motion timeScales the global timeline and would fire a
      // delayedCall almost immediately.
      demo: function () {
        if (isOpen) return null;
        const handle = openSheet();
        setTimeout(function () { closeSheet(); }, (duration + 0.9) * 1000);
        return handle;
      },
    };
  }

  function waitForGSAP(cb, attempts) {
    attempts = attempts || 0;
    if (typeof gsap !== 'undefined' && typeof CustomEase !== 'undefined') {
      cb();
      return;
    }
    if (attempts < 100) setTimeout(function () { waitForGSAP(cb, attempts + 1); }, 50);
    else console.error('[Annnimate] gsap/CustomEase failed to load');
  }

  waitForGSAP(function () {
    gsap.registerPlugin(CustomEase);
    CustomEase.create('annnimate', 'M0,0 C0.3,0.9 0.1,1 1,1');
    CustomEase.create('annnimateInOut', 'M0,0 C0.7,0 0.16,1 1,1');

    const instances = [];
    document.querySelectorAll('[data-anm-feature-dialog]').forEach(function (el) {
      const api = initFeatureDialog(el);
      if (api) instances.push(api);
    });

    window.Anm = window.Anm || {};
    window.Anm.FeatureDialog = {
      refresh: function () {
        instances.length = 0;
        document.querySelectorAll('[data-anm-feature-dialog]').forEach(function (el) {
          const api = initFeatureDialog(el);
          if (api) instances.push(api);
        });
      },
      open: function () { instances.forEach(function (i) { i.open(); }); },
      close: function () { instances.forEach(function (i) { i.close(); }); },
      demo: function () { return instances[0] ? instances[0].demo() : null; },
    };
  });
})();
