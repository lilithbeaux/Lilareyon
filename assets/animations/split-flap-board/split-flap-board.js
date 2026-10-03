(function () {
  'use strict';

  // Split Flap Board - a Solari-style results board. Every tile is a drum of
  // flaps: the top flap falls forward around the seam showing the outgoing
  // character, the top half behind it already carries the incoming one, and
  // the bottom flap lands from edge-on to complete it. A tile riffles through
  // the characters between its current and target glyph, so tiles resolve at
  // different times the way a real board does; rows cascade left to right.
  // Each tile is its own drum: a digit position only carries digits, an
  // uppercase position only uppercase letters, a lowercase one only lowercase,
  // so a letter never riffles past a number and the case of a word is kept.
  // No autoplay: click, arrows or keys advance the set.

  function initSplitFlapBoard(container) {
    if (isDisabledOnViewport(container)) return null;

    // --- 1. Selectors ---
    const setsData = container.querySelector('[data-anm-sfb-sets]');
    const stage = container.querySelector('[data-anm-sfb-stage]');
    const setEls = setsData ? Array.from(setsData.querySelectorAll('[data-anm-sfb-set]')) : [];

    if (!stage || setEls.length < 1) return null;

    // --- 2. Config ---
    // the period of the LAST flap of a tile; the flaps before it run faster
    const duration = parseFloat(container.dataset.anmDuration || '0.36');
    const stagger = parseFloat(container.dataset.anmStagger || '0.015');
    // degrees the flap rebounds off the stack after landing; 0 = a dead stop
    const bounce = Math.max(0, parseFloat(container.dataset.anmBounce || '32'));
    const columnsAttr = parseInt(container.dataset.anmColumns || '0', 10);
    // flaps a tile passes through before the one that lands on the target
    const cycles = Math.max(0, parseInt(container.dataset.anmCycles || '2', 10));

    // --- 3. Constants ---
    // A riffle tick is one mechanical click; the last flap of a tile is the
    // slow one that lands with the configured settle.
    // One flap, as fractions of its period: released from the top stop it
    // falls under gravity (accelerating the whole way), the bottom flap
    // carries the fall onto the stack and slams (still accelerating),
    // rebounds `bounce` degrees, drops again, then rests until the next
    // release. Nothing eases out into the landing - that is what reads as
    // a click instead of a settle.
    const FALL_FRAC = 0.4;
    const LAND_FRAC = 0.18;
    const BOUNCE_UP_FRAC = 0.16;
    const BOUNCE_DOWN_FRAC = 0.2;
    const FALL_EASE = 'power2.in';
    const LAND_EASE = 'power1.in';
    // With the perspective origin on the hinge, a tilt under ~20 degrees moves
    // the flap edge by less than a pixel (cosine shrink and perspective growth
    // cancel), so the rebound is exaggerated past a real board's 5 degrees
    // and read through two cues: a shadow gap opening under the lifted edge
    // on the half behind it, and a faint glint on the flap itself.
    const GLINT_PEAK = 0.07;
    const GAP_SHADE = 0.45;
    // The riffle runs faster than the landing flap and speeds up with more
    // cycles, so the drum reads as spinning and then stopping on the target:
    // the first flap runs at duration / (1 + cycles * RIFFLE_SPEEDUP), each
    // next one a little longer, the last one at the full duration.
    const RIFFLE_SPEEDUP = 0.35;
    const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const LOWER = 'abcdefghijklmnopqrstuvwxyz';
    const DIGITS = '0123456789';
    const ROW_STAGGER = 0.12;
    const SHADE_PEAK = 0.55;
    const ARROW_HOVER_DUR = 0.35;
    const PERSPECTIVE = 320;

    // --- 4. State ---
    const sets = setEls.map(function (el) {
      return (el.dataset.lines || '').split('|');
    });
    const rowCount = sets.reduce(function (m, s) { return Math.max(m, s.length); }, 0);
    const columns = columnsAttr > 0
      ? columnsAttr
      : sets.reduce(function (m, s) {
        return s.reduce(function (mm, line) { return Math.max(mm, line.length); }, m);
      }, 1);
    let refs = null;
    let index = 0;
    let master = null;

    // --- 5. Helpers ---
    // The drum a tile riffles on, decided by the glyph it is heading to (or
    // the one it holds, when heading to a blank): digits, uppercase or
    // lowercase, each with a blank flap. Punctuation has no drum.
    function drumFor(fromChar, toChar) {
      const ref = toChar !== ' ' ? toChar : fromChar;
      if (/[0-9]/.test(ref)) return ' ' + DIGITS;
      if (/[A-Z]/.test(ref)) return ' ' + UPPER;
      if (/[a-z]/.test(ref)) return ' ' + LOWER;
      return ' ' + ref;
    }

    function padLine(line) {
      return line.slice(0, columns).padEnd(columns, ' ');
    }

    function targetLines(i) {
      const s = sets[i] || [];
      const lines = [];
      for (let r = 0; r < rowCount; r += 1) lines.push(padLine(s[r] || ''));
      return lines;
    }

    // The characters a tile passes on its way from one glyph to the next,
    // walking the drum forward and wrapping, thinned evenly to `cycles`
    // intermediate flaps; always ends on the target.
    function riffleSequence(fromChar, toChar) {
      const drum = drumFor(fromChar, toChar);
      const n = drum.length;
      let i = Math.max(0, drum.indexOf(fromChar));
      const end = Math.max(0, drum.indexOf(toChar));
      if (fromChar === toChar) return [];
      if (i === end) return [toChar];
      const seq = [];
      while (i !== end) {
        i = (i + 1) % n;
        seq.push(drum[i]);
      }
      const steps = cycles + 1;
      if (seq.length <= steps) return seq;
      const last = seq.length - 1;
      const thinned = [];
      for (let s = 0; s < steps - 1; s += 1) {
        thinned.push(seq[Math.floor((s * last) / (steps - 1))]);
      }
      thinned.push(seq[last]);
      return thinned;
    }

    function el(tag, className) {
      const node = document.createElement(tag);
      node.className = className;
      return node;
    }

    function charSpan(where) {
      const span = el('span', 'sfb_char sfb_char_' + where);
      span.textContent = ' ';
      return span;
    }

    function buildTile() {
      const tile = el('div', 'sfb_tile');
      tile.setAttribute('aria-hidden', 'true');
      const halfTop = el('div', 'sfb_half sfb_half_top');
      const halfBottom = el('div', 'sfb_half sfb_half_bottom');
      const flapTop = el('div', 'sfb_flap sfb_flap_top');
      const flapBottom = el('div', 'sfb_flap sfb_flap_bottom');
      const shade = el('div', 'sfb_shade');
      const glint = el('div', 'sfb_glint');
      const t = {
        el: tile,
        halfTopChar: charSpan('top'),
        halfBottomChar: charSpan('bottom'),
        flapTop: flapTop,
        flapTopChar: charSpan('top'),
        flapBottom: flapBottom,
        flapBottomChar: charSpan('bottom'),
        shade: shade,
        glint: glint,
        current: ' ',
      };
      halfTop.appendChild(t.halfTopChar);
      halfBottom.appendChild(t.halfBottomChar);
      halfBottom.appendChild(shade);
      flapTop.appendChild(t.flapTopChar);
      flapBottom.appendChild(t.flapBottomChar);
      flapBottom.appendChild(glint);
      tile.appendChild(halfTop);
      tile.appendChild(halfBottom);
      tile.appendChild(flapTop);
      tile.appendChild(flapBottom);
      return t;
    }

    function arrowButton(dir) {
      const btn = el('button', 'sfb_arrow');
      btn.type = 'button';
      btn.setAttribute('aria-label', dir < 0 ? 'Previous result' : 'Next result');
      btn.innerHTML = '<svg class="sfb_arrow_icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="'
        + (dir < 0 ? 'M10 3L5 8L10 13' : 'M6 3L11 8L6 13')
        + '" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      return btn;
    }

    function setTileChar(t, ch) {
      t.halfTopChar.textContent = ch;
      t.halfBottomChar.textContent = ch;
      t.flapTopChar.textContent = ch;
      t.flapBottomChar.textContent = ch;
      t.current = ch;
    }

    function announce() {
      refs.live.textContent = (sets[index] || []).join(', ');
    }

    // A killed run can leave a flap mid-fall. Every tile is put back to a
    // whole glyph (whatever it had last committed) before the next run.
    function normalizeTiles() {
      refs.rows.forEach(function (tiles) {
        tiles.forEach(function (t) {
          gsap.killTweensOf([t.flapTop, t.flapBottom, t.shade, t.glint]);
          setTileChar(t, t.current);
          gsap.set([t.flapTop, t.flapBottom], { rotateX: 0 });
          gsap.set([t.shade, t.glint], { opacity: 0 });
        });
      });
    }

    // --- 6. Animation routines ---
    function buildStage() {
      stage.innerHTML = '';
      const board = el('div', 'sfb_board');
      board.setAttribute('role', 'group');
      board.setAttribute('aria-label', 'Results board');
      board.setAttribute('tabindex', '0');

      const rows = [];
      for (let r = 0; r < rowCount; r += 1) {
        const row = el('div', 'sfb_row');
        const tiles = [];
        for (let c = 0; c < columns; c += 1) {
          const t = buildTile();
          row.appendChild(t.el);
          tiles.push(t);
        }
        board.appendChild(row);
        rows.push(tiles);
      }

      const pill = el('div', 'sfb_pill');
      pill.setAttribute('role', 'group');
      pill.setAttribute('aria-label', 'Result controls');
      const prevBtn = arrowButton(-1);
      const nextBtn = arrowButton(1);
      pill.appendChild(prevBtn);
      pill.appendChild(nextBtn);

      const live = el('div', 'sfb_live');
      live.setAttribute('aria-live', 'polite');

      stage.appendChild(board);
      stage.appendChild(pill);
      stage.appendChild(live);

      refs = { board: board, rows: rows, prevBtn: prevBtn, nextBtn: nextBtn, live: live };
    }

    // One flap: the top flap falls to edge-on showing the outgoing glyph (the
    // incoming one is already on the half behind it), the bottom flap carries
    // the same fall on to the stack, bounces, and rests. Text swaps sit on
    // calls so a killed timeline never leaves a half-set tile: the next run
    // re-seeds from the tile's current glyph.
    function addFlap(tl, t, outChar, inChar, at, period) {
      const fall = period * FALL_FRAC;
      const land = period * LAND_FRAC;
      const up = period * BOUNCE_UP_FRAC;
      const down = period * BOUNCE_DOWN_FRAC;
      tl.call(function () {
        t.flapTopChar.textContent = outChar;
        t.halfTopChar.textContent = inChar;
        t.flapBottomChar.textContent = inChar;
        gsap.set(t.flapTop, { rotateX: 0 });
        gsap.set(t.flapBottom, { rotateX: 90 });
      }, null, at);
      tl.to(t.flapTop, { rotateX: -90, duration: fall, ease: FALL_EASE, force3D: true }, at);
      tl.to(t.shade, { opacity: SHADE_PEAK, duration: fall, ease: 'power2.in' }, at);
      tl.call(function () {
        t.halfBottomChar.textContent = inChar;
        t.flapTopChar.textContent = inChar;
        gsap.set(t.flapTop, { rotateX: 0 });
        t.current = inChar;
      }, null, at + fall);
      tl.to(t.flapBottom, { rotateX: 0, duration: land, ease: LAND_EASE, force3D: true }, at + fall);
      if (bounce > 0) {
        tl.to(t.flapBottom, { rotateX: bounce, duration: up, ease: 'power1.out', force3D: true }, at + fall + land);
        tl.to(t.flapBottom, { rotateX: 0, duration: down, ease: 'power1.in', force3D: true }, at + fall + land + up);
        tl.to(t.glint, { opacity: GLINT_PEAK * Math.min(1, bounce / 32), duration: up, ease: 'power1.out' }, at + fall + land);
        tl.to(t.glint, { opacity: 0, duration: down, ease: 'power1.in' }, at + fall + land + up);
        tl.to(t.shade, { opacity: 0, duration: land, ease: 'power2.out' }, at + fall);
        tl.to(t.shade, { opacity: GAP_SHADE * Math.min(1, bounce / 32), duration: up, ease: 'power1.out' }, at + fall + land);
        tl.to(t.shade, { opacity: 0, duration: down, ease: 'power1.in' }, at + fall + land + up);
      } else {
        tl.to(t.shade, { opacity: 0, duration: land, ease: 'power2.out' }, at + fall);
      }
    }

    function flapPeriod(i, count) {
      const fast = duration / (1 + cycles * RIFFLE_SPEEDUP);
      if (count <= 1) return duration;
      return fast + (duration - fast) * (i / (count - 1));
    }

    function buildTileTimeline(t, toChar) {
      const seq = riffleSequence(t.current, toChar);
      const tl = gsap.timeline();
      let prev = t.current;
      let cursor = 0;
      seq.forEach(function (ch, i) {
        const period = flapPeriod(i, seq.length);
        addFlap(tl, t, prev, ch, cursor, period);
        cursor += period;
        prev = ch;
      });
      return tl;
    }

    function flapTo(nextIndex) {
      const target = ((nextIndex % sets.length) + sets.length) % sets.length;
      if (target === index) return null;
      index = target;
      const lines = targetLines(index);

      if (master) { master.kill(); master = null; normalizeTiles(); }
      master = gsap.timeline({
        onComplete: function () { master = null; announce(); },
      });

      refs.rows.forEach(function (tiles, r) {
        const rowTl = gsap.timeline({
          data: { label: 'Row ' + (r + 1) + ' flaps to "' + lines[r].trim() + '"' },
        });
        let any = false;
        tiles.forEach(function (t, c) {
          if (t.current === lines[r][c]) return;
          any = true;
          rowTl.add(buildTileTimeline(t, lines[r][c]), c * stagger);
        });
        if (any) master.add(rowTl, r * ROW_STAGGER);
      });

      return master;
    }

    function step(delta) {
      return flapTo(index + delta);
    }

    function demo() {
      if (master && master.isActive()) return null;
      return step(1);
    }

    function animateArrowHover(btn, dir) {
      const icon = btn.querySelector('.sfb_arrow_icon');
      btn.addEventListener('mouseenter', function () {
        gsap.to(icon, { x: dir * 3, duration: ARROW_HOVER_DUR, ease: 'back.out(2)', overwrite: 'auto', force3D: true });
      });
      btn.addEventListener('mouseleave', function () {
        gsap.to(icon, { x: 0, duration: ARROW_HOVER_DUR, ease: 'expo.out', overwrite: 'auto', force3D: true });
      });
    }

    // --- 7. Event listeners ---
    buildStage();

    refs.board.addEventListener('click', function () { step(1); });
    refs.prevBtn.addEventListener('click', function () { step(-1); });
    refs.nextBtn.addEventListener('click', function () { step(1); });
    animateArrowHover(refs.prevBtn, -1);
    animateArrowHover(refs.nextBtn, 1);

    function onKeydown(e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(1); }
    }
    refs.board.addEventListener('keydown', onKeydown);

    function handleVisibility() {
      if (document.hidden) gsap.globalTimeline.pause();
      else gsap.globalTimeline.resume();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    // --- 8. Initial DOM state ---
    const first = targetLines(0);
    refs.rows.forEach(function (tiles, r) {
      tiles.forEach(function (t, c) {
        setTileChar(t, first[r][c]);
        gsap.set([t.flapTop, t.flapBottom], { rotateX: 0, transformPerspective: PERSPECTIVE, force3D: true });
        gsap.set([t.shade, t.glint], { opacity: 0 });
      });
    });
    announce();

    // --- 9. Reduced motion ---
    gsap.matchMedia().add('(prefers-reduced-motion: reduce)', function () {
      gsap.globalTimeline.timeScale(20);
    });

    function destroy() {
      document.removeEventListener('visibilitychange', handleVisibility);
      refs.board.removeEventListener('keydown', onKeydown);
      if (master) master.kill();
    }

    // --- 10. Public API ---
    return {
      destroy: destroy,
      next: function () { return step(1); },
      prev: function () { return step(-1); },
      goTo: function (i) { return flapTo(i); },
      demo: demo,
    };
  }

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

  function waitForGSAP(cb, attempts) {
    attempts = attempts || 0;
    if (typeof gsap !== 'undefined') { cb(); return; }
    if (attempts < 100) setTimeout(function () { waitForGSAP(cb, attempts + 1); }, 50);
    else console.error('[Annnimate] gsap failed to load');
  }

  waitForGSAP(function () {
    if (typeof CustomEase !== 'undefined') {
      gsap.registerPlugin(CustomEase);
      CustomEase.create('annnimate', 'M0,0 C0.3,0.9 0.1,1 1,1');
      CustomEase.create('annnimateInOut', 'M0,0 C0.7,0 0.16,1 1,1');
    }

    const instances = [];
    document.querySelectorAll('[data-anm-split-flap-board]').forEach(function (el) {
      const api = initSplitFlapBoard(el);
      if (api) instances.push(api);
    });
    window.Anm = window.Anm || {};
    window.Anm.SplitFlapBoard = {
      destroy: function () { instances.forEach(function (i) { i.destroy(); }); },
      next: function () { instances.forEach(function (i) { i.next(); }); },
      prev: function () { instances.forEach(function (i) { i.prev(); }); },
      goTo: function (i) { instances.forEach(function (inst) { inst.goTo(i); }); },
      demo: function () { return instances[0] ? instances[0].demo() : null; },
    };
  });
})();
