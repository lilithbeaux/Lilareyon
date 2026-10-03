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

  function initMultiLevelDrawerMenu(container) {
    if (isDisabledOnViewport(container)) return null;

    let toggle        = container.querySelector('[data-anm-mldm-toggle]');
    let overlay       = container.querySelector('[data-anm-mldm-overlay]');
    let scrim         = container.querySelector('[data-anm-mldm-scrim]');
    let panel1        = container.querySelector('[data-anm-mldm-panel-level="1"]');
    let panel2        = container.querySelector('[data-anm-mldm-panel-level="2"]');
    let primaryNav    = container.querySelector('.mldm_primary_nav');
    let primaries     = container.querySelectorAll('[data-anm-mldm-primary]');
    let sublists      = container.querySelectorAll('[data-anm-mldm-sublist]');
    let labelTrack    = container.querySelector('[data-anm-mldm-label-track]');
    let labelOpen     = container.querySelector('[data-anm-mldm-label-open]');
    let iconTop       = container.querySelector('[data-anm-mldm-icon-top]');
    let iconBottom    = container.querySelector('[data-anm-mldm-icon-bottom]');
    let logoEl        = container.querySelector('[data-anm-mldm-logo]');
    let backBtn       = container.querySelector('[data-anm-mldm-back]');

    function isMobile() {
      return window.matchMedia('(max-width: 767px)').matches;
    }

    function setPanel2InitialState() {
      if (isMobile()) {
        // Shift by viewport width - guarantees panel 2 is fully off-screen
        // regardless of viewport (xPercent 100 alone leaves a 1rem sliver
        // visible because panel 2 has a 1rem left offset)
        gsap.set(panel2, { clipPath: CLIP_VISIBLE, xPercent: 0, x: '100vw' });
      } else {
        gsap.set(panel2, { clipPath: CLIP_HIDDEN, xPercent: 0, x: 0 });
      }
    }

    if (!toggle || !overlay || !panel1) return;

    // --- Config ---------------------------------------------------------------
    let duration  = parseFloat(container.dataset.anmDuration  || '0.9');
    let ease      = container.dataset.anmEase                  || 'expo.out';
    let stagger   = parseFloat(container.dataset.anmStagger   || '0.06');
    let panelBg   = container.dataset.anmPanelBg               || '#ececec';

    if (panel1) panel1.style.backgroundColor = panelBg;
    if (panel2) panel2.style.backgroundColor = panelBg;

    // --- Constants -----------------------------------------------------------
    let HOVER_DUR        = 0.4;
    let HOVER_EASE       = 'back.out';
    let DOT_GAP_PRIMARY  = 12;
    let DOT_GAP_SUB      = 10;
    let ICON_BURGER_OFFSET = 3;
    let PANEL_RADIUS     = 8;
    let CLOSE_PANEL2_DELAY = 200; // ms - buffer when leaving panel 1 nav

    // Clip-path with rounded corners so the reveal always shows a rounded edge
    let CLIP_HIDDEN  = 'inset(0% 100% 0% 0% round ' + PANEL_RADIUS + 'px)';
    let CLIP_VISIBLE = 'inset(0% 0% 0% 0% round '   + PANEL_RADIUS + 'px)';

    let TOGGLE_DARK  = '#0a0a0a';
    let TOGGLE_LIGHT = '#ffffff';

    // --- State ----------------------------------------------------------------
    let isOpen          = false;
    let panel2Open      = false;
    let activeSubId     = null;
    let openTl          = null;
    let closeTl         = null;
    let panel2CloseTimer = null;

    // --- Helpers --------------------------------------------------------------
    function getSublistFor(id) {
      return id ? container.querySelector('[data-anm-mldm-sublist][data-anm-mldm-sublist-for="' + id + '"]') : null;
    }
    function hasSublistFor(id) { return !!getSublistFor(id); }

    function setActiveSublist(id) {
      sublists.forEach(function (sl) {
        let isMatch = sl.dataset.anmMldmSublistFor === id;
        sl.classList.toggle('mldm_sublist_active', isMatch);
        sl.setAttribute('aria-hidden', String(!isMatch));
        sl.style.visibility    = isMatch ? 'visible' : 'hidden';
        sl.style.pointerEvents = isMatch ? 'auto'    : 'none';
      });
      activeSubId = id;
      primaries.forEach(function (btn) {
        btn.setAttribute('aria-expanded', String(btn.dataset.anmMldmTarget === id));
      });
    }

    function resetSubLinkVisuals(sublist) {
      if (!sublist) return;
      sublist.querySelectorAll('[data-anm-mldm-secondary-link]').forEach(function (item) {
        let lbl = item.querySelector('.mldm_sublink_label');
        let dot = item.querySelector('.mldm_sublink_dot');
        if (lbl) gsap.set(lbl, { x: 0, opacity: 0 });
        if (dot) gsap.set(dot, { scale: 0 });
      });
    }

    function cancelPanel2CloseTimer() {
      if (panel2CloseTimer) {
        clearTimeout(panel2CloseTimer);
        panel2CloseTimer = null;
      }
    }
    function schedulePanel2Close() {
      cancelPanel2CloseTimer();
      panel2CloseTimer = setTimeout(function () {
        panel2CloseTimer = null;
        closePanel2();
      }, CLOSE_PANEL2_DELAY);
    }

    // --- Hover (mirror fullscreen-slide-menu link hover) ---------------------
    function attachPrimaryHover(btn) {
      let dot = btn.querySelector('.mldm_primary_dot');
      let lbl = btn.querySelector('.mldm_primary_label');
      if (!dot || !lbl) return;
      function enter() {
        let offset = dot.offsetWidth + DOT_GAP_PRIMARY;
        gsap.to(dot, { scale: 1,  duration: HOVER_DUR, ease: HOVER_EASE, overwrite: 'auto', force3D: true });
        gsap.to(lbl, { x: offset, duration: HOVER_DUR, ease: HOVER_EASE, overwrite: 'auto', force3D: true });
      }
      function leave() {
        gsap.to(dot, { scale: 0, duration: HOVER_DUR, ease: HOVER_EASE, overwrite: 'auto', force3D: true });
        gsap.to(lbl, { x: 0,     duration: HOVER_DUR, ease: HOVER_EASE, overwrite: 'auto', force3D: true });
      }
      btn.addEventListener('mouseenter', enter);
      btn.addEventListener('mouseleave', leave);
    }

    function attachSubHover(btn) {
      let dot = btn.querySelector('.mldm_sublink_dot');
      let lbl = btn.querySelector('.mldm_sublink_label');
      if (!dot || !lbl) return;
      function enter() {
        let offset = dot.offsetWidth + DOT_GAP_SUB;
        gsap.to(dot, { scale: 1,  duration: HOVER_DUR, ease: HOVER_EASE, overwrite: 'auto', force3D: true });
        gsap.to(lbl, { x: offset, duration: HOVER_DUR, ease: HOVER_EASE, overwrite: 'auto', force3D: true });
      }
      function leave() {
        gsap.to(dot, { scale: 0, duration: HOVER_DUR, ease: HOVER_EASE, overwrite: 'auto', force3D: true });
        gsap.to(lbl, { x: 0,     duration: HOVER_DUR, ease: HOVER_EASE, overwrite: 'auto', force3D: true });
      }
      btn.addEventListener('mouseenter', enter);
      btn.addEventListener('mouseleave', leave);
    }

    // --- Panel 2: open / close / swap content (hover-driven) -----------------
    function openPanel2(targetId) {
      cancelPanel2CloseTimer();
      let sublist = getSublistFor(targetId);
      if (!sublist) { closePanel2(); return; }
      if (panel2Open && activeSubId === targetId) return;
      if (panel2Open && activeSubId !== targetId) {
        swapSublistContent(targetId);
        return;
      }
      panel2Open = true;
      setActiveSublist(targetId);
      resetSubLinkVisuals(sublist);

      if (isMobile()) {
        gsap.to(panel2, {
          x: 0,
          duration: 0.5,
          ease: 'expo.out',
          easeReverse: true,
          force3D: true,
          overwrite: 'auto'
        });
      } else {
        gsap.to(panel2, {
          clipPath: CLIP_VISIBLE,
          duration: 0.6,
          ease: 'expo.out',
          easeReverse: true,
          force3D: true,
          overwrite: 'auto'
        });
      }

      let labels = sublist.querySelectorAll('.mldm_sublink_label');
      gsap.fromTo(labels,
        { opacity: 0, x: -16 },
        {
          opacity: 1, x: 0,
          duration: 0.5,
          stagger: stagger,
          ease: 'expo.out',
          easeReverse: true,
          force3D: true,
          overwrite: 'auto',
          delay: 0.1
        }
      );
    }

    function closePanel2() {
      cancelPanel2CloseTimer();
      if (!panel2Open) return;
      panel2Open = false;
      if (isMobile()) {
        gsap.to(panel2, {
          x: '100vw',
          duration: 0.4,
          ease: 'expo.out',
          force3D: true,
          overwrite: 'auto'
        });
      } else {
        gsap.to(panel2, {
          clipPath: CLIP_HIDDEN,
          duration: 0.45,
          ease: 'expo.out',
          force3D: true,
          overwrite: 'auto'
        });
      }
    }

    function swapSublistContent(newId) {
      let oldSublist = getSublistFor(activeSubId);
      let newSublist = getSublistFor(newId);
      if (!newSublist) return;

      function showNew() {
        setActiveSublist(newId);
        resetSubLinkVisuals(newSublist);
        let labels = newSublist.querySelectorAll('.mldm_sublink_label');
        gsap.fromTo(labels,
          { opacity: 0, x: -16 },
          {
            opacity: 1, x: 0,
            duration: 0.45,
            ease: 'expo.out',
            easeReverse: true,
            stagger: stagger,
            force3D: true,
            overwrite: 'auto'
          }
        );
      }

      if (oldSublist) {
        let oldLabels = oldSublist.querySelectorAll('.mldm_sublink_label');
        gsap.to(oldLabels, {
          opacity: 0, x: -8,
          duration: 0.18,
          ease: 'expo.out',
          stagger: stagger * 0.3,
          overwrite: 'auto',
          onComplete: showNew
        });
      } else {
        showNew();
      }
    }

    // --- Build paired open + close timelines ---------------------------------
    function buildTimelines() {
      if (openTl)  openTl.kill();
      if (closeTl) closeTl.kill();

      let primaryItems  = container.querySelectorAll('[data-anm-mldm-primary]');
      let primaryLabels = container.querySelectorAll('.mldm_primary_label');
      let explore       = container.querySelector('.mldm_explore');
      let cards         = container.querySelectorAll('.mldm_card');
      let footerLinks   = container.querySelectorAll('.mldm_footer_link');

      let labelHeight = labelOpen ? labelOpen.offsetHeight : 16;
      let trackOpenY  = -(labelHeight + 2);

      let p1Extras = [];
      if (explore) p1Extras.push(explore);
      cards.forEach(function (c) { p1Extras.push(c); });
      footerLinks.forEach(function (f) { p1Extras.push(f); });

      let navAll = [].slice.call(primaryLabels).concat(p1Extras);

      // --- OPEN TIMELINE ----------------------------------------------------
      openTl = gsap.timeline({
        paused: true,
        defaults: { ease: ease, easeReverse: true, force3D: true },
        onStart: function () {
          overlay.removeAttribute('inert');
          overlay.setAttribute('aria-hidden', 'false');
          container.dispatchEvent(new CustomEvent('anm-mldm-open', { bubbles: true, detail: { container: container } }));
        }
      });

      // Lock starting state at the very beginning of the timeline (panel 2 is
      // initialized separately via setPanel2InitialState - different per viewport)
      openTl.set(panel1, { clipPath: CLIP_HIDDEN });
      openTl.set(scrim,            { opacity: 0 });
      openTl.set(toggle,           { color: TOGGLE_DARK });
      if (logoEl) openTl.set(logoEl, { color: TOGGLE_DARK });
      openTl.set(labelTrack,       { y: 0 });
      openTl.set(iconTop,          { y: -ICON_BURGER_OFFSET, rotation: 0 });
      openTl.set(iconBottom,       { y:  ICON_BURGER_OFFSET, rotation: 0 });
      primaryItems.forEach(function (btn) {
        let dot = btn.querySelector('.mldm_primary_dot');
        if (dot) openTl.set(dot, { scale: 0 });
      });
      openTl.set(navAll, { opacity: 0, x: -16 });

      // Dim fades in
      openTl.to(scrim, { opacity: 1, duration: duration * 0.75 }, 0);
      // Panel 1 clip reveal L->R (rounded corners)
      openTl.to(panel1, { clipPath: CLIP_VISIBLE, duration: duration }, 0.05);
      // Toggle + logo colors shift to light
      openTl.to(toggle, { color: TOGGLE_LIGHT, duration: duration * 0.6 }, duration * 0.2);
      if (logoEl) openTl.to(logoEl, { color: TOGGLE_LIGHT, duration: duration * 0.6 }, duration * 0.2);
      // Toggle label + icon morph
      if (labelTrack)              openTl.to(labelTrack, { y: trackOpenY,      duration: duration * 0.55 }, duration * 0.2);
      if (iconTop && iconBottom) {
        openTl.to(iconTop,    { y: 0, rotation: 45,  duration: duration * 0.6 }, duration * 0.2);
        openTl.to(iconBottom, { y: 0, rotation: -45, duration: duration * 0.6 }, duration * 0.2);
      }
      // Primary labels - opacity + x stagger
      openTl.to(primaryLabels, { opacity: 1, x: 0, duration: 0.55, stagger: stagger }, duration * 0.35);
      // Bottom-row extras
      if (p1Extras.length) {
        openTl.to(p1Extras, { opacity: 1, x: 0, duration: 0.55, stagger: stagger * 0.7 }, duration * 0.45);
      }

      // --- CLOSE TIMELINE ---------------------------------------------------
      // Faster than open, nav items just fade out (no x animation)
      let closeDur = duration * 0.55; // ~0.5s
      closeTl = gsap.timeline({
        paused: true,
        defaults: { ease: 'expo.out', force3D: true },
        onComplete: function () {
          overlay.setAttribute('inert', '');
          overlay.setAttribute('aria-hidden', 'true');
          container.dispatchEvent(new CustomEvent('anm-mldm-close', { bubbles: true, detail: { container: container } }));
        }
      });

      // Nav fades out fast (opacity only - no x reverse per design)
      closeTl.to(navAll, {
        opacity: 0,
        duration: 0.15,
        stagger: stagger * 0.3
      }, 0);
      // Panel 1 clip back to hidden
      closeTl.to(panel1, { clipPath: CLIP_HIDDEN, duration: closeDur }, 0.05);
      // Dim fades out
      closeTl.to(scrim, { opacity: 0, duration: closeDur * 0.8 }, 0.1);
      // Toggle + logo colors back to dark
      closeTl.to(toggle, { color: TOGGLE_DARK, duration: closeDur * 0.6 }, 0.05);
      if (logoEl) closeTl.to(logoEl, { color: TOGGLE_DARK, duration: closeDur * 0.6 }, 0.05);
      // Toggle label + icon morph back
      if (labelTrack)              closeTl.to(labelTrack, { y: 0, duration: closeDur * 0.55 }, 0.05);
      if (iconTop && iconBottom) {
        closeTl.to(iconTop,    { y: -ICON_BURGER_OFFSET, rotation: 0, duration: closeDur * 0.6 }, 0.05);
        closeTl.to(iconBottom, { y:  ICON_BURGER_OFFSET, rotation: 0, duration: closeDur * 0.6 }, 0.05);
      }
    }

    // --- Open / Close ---------------------------------------------------------
    function open() {
      if (isOpen) return;
      isOpen = true;
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation menu');
      panel2Open = false;
      activeSubId = null;
      setPanel2InitialState();
      buildTimelines();
      if (closeTl) closeTl.pause(0);
      openTl.restart();
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      closePanel2();
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation menu');
      toggle.focus();
      if (openTl)  openTl.pause();
      if (closeTl) closeTl.restart();
    }

    function toggleMenu() { isOpen ? close() : open(); }

    // --- Primary interactions: hover + click for keyboard parity -------------
    primaries.forEach(function (btn) {
      attachPrimaryHover(btn);

      btn.addEventListener('mouseenter', function () {
        if (!isOpen) return;
        if (isMobile()) return; // mobile uses click, not hover
        cancelPanel2CloseTimer();
        let targetId = btn.dataset.anmMldmTarget;
        if (targetId && hasSublistFor(targetId)) {
          openPanel2(targetId);
        } else {
          schedulePanel2Close();
        }
      });

      btn.addEventListener('click', function (e) {
        if (!isOpen) return;
        e.preventDefault();
        cancelPanel2CloseTimer();
        let targetId = btn.dataset.anmMldmTarget;
        if (targetId && hasSublistFor(targetId)) {
          openPanel2(targetId);
        } else {
          closePanel2();
        }
      });
    });

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (!isOpen) return;
        closePanel2();
      });
    }

    container.querySelectorAll('[data-anm-mldm-secondary-link]').forEach(attachSubHover);

    // Card hover -- JS-driven so it works in Webflow (parent:hover-child gets stripped)
    container.querySelectorAll('.mldm_card').forEach(function (card) {
      let img = card.querySelector('.mldm_card_img');
      if (!img) return;
      card.addEventListener('mouseenter', function () {
        gsap.to(img, { scale: 1.04, duration: 0.6, ease: 'expo.out', overwrite: 'auto', force3D: true });
      });
      card.addEventListener('mouseleave', function () {
        gsap.to(img, { scale: 1, duration: 0.6, ease: 'expo.out', overwrite: 'auto', force3D: true });
      });
    });

    // Panel 1 nav: schedule close on leave unless heading into panel 2 (desktop only)
    if (primaryNav) {
      primaryNav.addEventListener('mouseleave', function (e) {
        if (!isOpen || isMobile()) return;
        if (panel2 && panel2.contains(e.relatedTarget)) return;
        schedulePanel2Close();
      });
    }
    // Panel 2: while cursor is inside, never close. Cancel any pending close on enter.
    if (panel2) {
      panel2.addEventListener('mouseenter', function () {
        if (isMobile()) return;
        cancelPanel2CloseTimer();
      });
      panel2.addEventListener('mouseleave', function (e) {
        if (!isOpen || isMobile()) return;
        if (primaryNav && primaryNav.contains(e.relatedTarget)) return;
        schedulePanel2Close();
      });
    }

    // --- Events ---------------------------------------------------------------
    toggle.addEventListener('click', toggleMenu);
    if (scrim) scrim.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });

    // Debounced resize: if user crosses the mobile/desktop boundary while the
    // drawer is closed, re-snap panel 2 to the right initial state for that
    // viewport (clip-path on desktop, off-screen translate on mobile). While
    // the drawer is open we just close it -- mid-flight viewport swaps are
    // not worth the state complexity.
    let resizeTimer;
    let wasMobile = isMobile();
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        let nowMobile = isMobile();
        if (nowMobile !== wasMobile) {
          wasMobile = nowMobile;
          if (isOpen) {
            close();
          } else {
            setPanel2InitialState();
          }
        }
      }, 150);
    });

    // Pause global timeline when tab is hidden so off-screen animation doesn't
    // burn cycles. Restored on visibility.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        gsap.globalTimeline.pause();
      } else {
        gsap.globalTimeline.resume();
      }
    });

    // --- Initial closed state ------------------------------------------------
    overlay.setAttribute('inert', '');
    overlay.setAttribute('aria-hidden', 'true');
    gsap.set(panel1, { clipPath: CLIP_HIDDEN });
    setPanel2InitialState();
    gsap.set(scrim,  { opacity: 0 });
    gsap.set(toggle, { color: TOGGLE_DARK });
    if (logoEl) gsap.set(logoEl, { color: TOGGLE_DARK });
    gsap.set(labelTrack, { y: 0 });
    gsap.set(iconTop,    { y: -ICON_BURGER_OFFSET, rotation: 0 });
    gsap.set(iconBottom, { y:  ICON_BURGER_OFFSET, rotation: 0 });
    sublists.forEach(function (sl) {
      sl.classList.remove('mldm_sublist_active');
      sl.setAttribute('aria-hidden', 'true');
      sl.style.visibility = 'hidden';
      sl.style.pointerEvents = 'none';
    });

    // --- Reduced motion -------------------------------------------------------
    gsap.matchMedia().add('(prefers-reduced-motion: reduce)', function () {
      gsap.globalTimeline.timeScale(20);
    });

    return { open: open, close: close, toggle: toggleMenu };
  }

  function waitForGSAP(cb, attempts) {
    attempts = attempts || 0;
    if (typeof gsap !== 'undefined') { cb(); return; }
    if (attempts < 100) setTimeout(function () { waitForGSAP(cb, attempts + 1); }, 50);
    else console.error('[Annnimate] gsap failed to load');
  }

  waitForGSAP(function () {
    let instances = [];
    document.querySelectorAll('[data-anm-multi-level-drawer-menu]').forEach(function (el) {
      let api = initMultiLevelDrawerMenu(el);
      if (api) instances.push(api);
    });
    window.Anm = window.Anm || {};
    window.Anm.MultiLevelDrawerMenu = {
      refresh: function () {
        instances.length = 0;
        document.querySelectorAll('[data-anm-multi-level-drawer-menu]').forEach(function (el) {
          let api = initMultiLevelDrawerMenu(el);
          if (api) instances.push(api);
        });
      },
      open:  function () { instances.forEach(function (i) { i.open(); }); },
      close: function () { instances.forEach(function (i) { i.close(); }); }
    };
  });

})();
