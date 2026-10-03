'use strict';

if (typeof gsap !== 'undefined' && typeof ScrambleTextPlugin !== 'undefined') {
  gsap.registerPlugin(ScrambleTextPlugin);
}
if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// ASCII character set for scramble effect
let ASCII_CHARS = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

// One representative pass per initialized element, for the Timeline
// inspector's demo() contract (ADR-0011). The first runner is the demo.
let demoRunners = [];

function initDualScramble() {
  demoRunners.length = 0;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let defaults = {
    duration: 0.6,
    chars: ASCII_CHARS,
    trigger: 'scroll',
    color1: 'dual-scramble-color-1',
    color2: 'dual-scramble-color-2',
    stagger: 0.1,
    start: 'top 80%'
  };

  let getConfig = function(el) {
    return {
      duration: parseFloat(el.dataset.anmDuration) || defaults.duration,
      chars:    el.dataset.anmChars   || defaults.chars,
      trigger:  el.dataset.anmTrigger || defaults.trigger,
      color1:   el.dataset.anmColor1  || defaults.color1,
      color2:   el.dataset.anmColor2  || defaults.color2
    };
  };

  let isDisabled = function(el) {
    let disable = el.dataset.anmDisable;
    if (!disable) return false;
    let breakpoints = {
      mobile:    '(max-width: 479px)',
      tablet:    '(max-width: 991px)',
      landscape: '(orientation: landscape) and (max-width: 991px)',
      desktop:   '(min-width: 992px)'
    };
    return disable.split(',').some(function(v) {
      let key = v.trim();
      return breakpoints[key] && window.matchMedia(breakpoints[key]).matches;
    });
  };

  let generateRandomChars = function(text, chars) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      let ch = text[i];
      if (ch === ' ' || ch === '\n' || ch === '\r') {
        result += ch;
      } else {
        result += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return result;
  };

  let buildLayout = function(el) {
    if (el.dataset.anmDualScrambleReady === 'true') {
      return {
        wrapper:    el,
        spacer:     el.querySelector('[data-anm-dual-scramble-spacer]'),
        scrambleEl: el.querySelector('[data-anm-dual-scramble-layer]'),
        originalText: el.dataset.anmOriginalText || ''
      };
    }

    let originalText = el.textContent.trim();
    el.dataset.anmOriginalText = originalText;

    el.innerHTML = '';

    let srSpan = document.createElement('span');
    srSpan.className = 'dual_scramble_sr';
    srSpan.textContent = originalText;
    el.appendChild(srSpan);

    let spacer = document.createElement('span');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.setAttribute('data-anm-dual-scramble-spacer', '');
    spacer.className = 'dual_scramble_spacer';
    spacer.textContent = originalText;
    el.appendChild(spacer);

    let scrambleEl = document.createElement('span');
    scrambleEl.setAttribute('aria-hidden', 'true');
    scrambleEl.setAttribute('data-anm-dual-scramble-layer', '');
    scrambleEl.className = 'dual_scramble_layer';
    el.appendChild(scrambleEl);

    el.dataset.anmDualScrambleReady = 'true';

    return { wrapper: el, spacer: spacer, scrambleEl: scrambleEl, originalText: originalText };
  };

  // Core dual-phase scramble: visible -> random (color-2->color-1) -> final (color-1->color-2)
  let runScramble = function(layout, config) {
    let scrambleEl = layout.scrambleEl;
    let finalText  = layout.originalText;
    let duration   = config.duration;
    let chars      = config.chars;
    let color1     = config.color1;
    let color2     = config.color2;

    if (reducedMotion) {
      scrambleEl.textContent = finalText;
      scrambleEl.className = 'dual_scramble_layer';
      return null;
    }

    if (typeof ScrambleTextPlugin === 'undefined') {
      scrambleEl.textContent = finalText;
      return null;
    }

    gsap.killTweensOf(scrambleEl);

    let randomTarget = generateRandomChars(finalText, chars);
    let charCount = finalText.replace(/\s/g, '').length;
    let oneLetterDelay = charCount > 0 ? duration / charCount : 0;

    scrambleEl.textContent = finalText;

    let tl = gsap.timeline();

    // Phase 1: current text -> random chars (color-2 -> color-1)
    tl.to(scrambleEl, {
      duration: duration,
      scrambleText: {
        text: randomTarget,
        chars: chars,
        speed: 1,
        revealDelay: 0.1,
        oldClass: color2,
        newClass: color1
      },
      ease: 'none',
      data: { label: 'Text dissolves into noise' }
    });

    // Phase 2: random chars -> final text (color-1 -> color-2)
    tl.to(scrambleEl, {
      duration: duration,
      scrambleText: {
        text: finalText,
        chars: chars,
        speed: 1,
        revealDelay: 0.1,
        oldClass: color1,
        newClass: color2
      },
      ease: 'none',
      data: { label: 'Noise resolves into the text' }
    }, oneLetterDelay);

    return tl;
  };

  // --- Solo elements (not in a group) ----------------------------------------
  let soloElements = Array.from(document.querySelectorAll('[data-anm-dual-scramble]')).filter(function(el) {
    return !el.closest('[data-anm-dual-scramble-group]');
  });

  soloElements.forEach(function(el) {
    if (isDisabled(el)) return;

    let config = getConfig(el);
    let layout = buildLayout(el);
    layout.scrambleEl.textContent = layout.originalText;

    demoRunners.push(function() { return runScramble(layout, config); });

    if (config.trigger === 'scroll') {
      if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.create({
          trigger: el,
          start: el.dataset.anmStart || defaults.start,
          once: true,
          onEnter: function() { runScramble(layout, config); }
        });
      }
    } else if (config.trigger === 'hover') {
      el.addEventListener('mouseenter', function() { runScramble(layout, config); });
    } else if (config.trigger === 'click') {
      el.addEventListener('click', function() { runScramble(layout, config); });
    } else if (config.trigger === 'load') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { runScramble(layout, config); });
      } else {
        runScramble(layout, config);
      }
    } else if (config.trigger === 'manual') {
      el.scrambleTrigger = function() { runScramble(layout, config); };
    }
  });

  // --- Group elements ---------------------------------------------------------
  let groups = document.querySelectorAll('[data-anm-dual-scramble-group]');

  groups.forEach(function(group) {
    if (isDisabled(group)) return;

    let stagger = parseFloat(group.dataset.anmStagger) || defaults.stagger;
    let startPos = group.dataset.anmStart || defaults.start;
    let groupTrigger = group.dataset.anmTrigger || defaults.trigger;

    let children = Array.from(group.querySelectorAll('[data-anm-dual-scramble]')).filter(function(el) {
      return !isDisabled(el);
    });

    if (!children.length) return;

    let items = children.map(function(el) {
      let config = getConfig(el);
      let layout = buildLayout(el);
      layout.scrambleEl.textContent = layout.originalText;
      return { layout: layout, config: config };
    });

    demoRunners.push(function() { return runScramble(items[0].layout, items[0].config); });

    let fireGroup = function() {
      items.forEach(function(item, i) {
        let delay = i * stagger;
        if (delay === 0) {
          runScramble(item.layout, item.config);
        } else {
          gsap.delayedCall(delay, function() {
            runScramble(item.layout, item.config);
          });
        }
      });
    };

    if (groupTrigger === 'scroll') {
      if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.create({
          trigger: group,
          start: startPos,
          once: true,
          onEnter: fireGroup
        });
      }
    } else if (groupTrigger === 'hover') {
      group.addEventListener('mouseenter', fireGroup);
    } else if (groupTrigger === 'click') {
      group.addEventListener('click', fireGroup);
    } else if (groupTrigger === 'load') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fireGroup);
      } else {
        fireGroup();
      }
    } else if (groupTrigger === 'manual') {
      group.scrambleTrigger = fireGroup;
    }
  });

  document.addEventListener('visibilitychange', function() {
    if (document.hidden && typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.getAll().forEach(function(st) { st.disable(); });
    } else if (!document.hidden && typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.getAll().forEach(function(st) { st.enable(); });
    }
  });

  let resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.refresh();
      }
    }, 150);
  });
}

function waitForGSAP(callback, attempts) {
  attempts = attempts || 0;
  if (typeof gsap !== 'undefined') {
    callback();
  } else if (attempts < 50) {
    setTimeout(function() { waitForGSAP(callback, attempts + 1); }, 100);
  } else {
    console.warn('GSAP not found - DualScramble cannot initialize');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { waitForGSAP(initDualScramble); });
} else {
  waitForGSAP(initDualScramble);
}

window.Anm = window.Anm || {};
window.Anm.DualScramble = {
  refresh: function() { waitForGSAP(initDualScramble); },
  // ADR-0011: one representative pass; the scramble ends showing the final
  // text, which is the component's idle state.
  demo: function() { return demoRunners[0] ? demoRunners[0]() : null; }
};
