'use strict';

gsap.registerPlugin(ScrollTrigger, SplitText);

function initScrollTextReveal() {
  // Skip if reduced motion is preferred
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const elements = document.querySelectorAll("[data-anm-scroll-text-reveal]");
  if (!elements.length) return;

  // Split configuration for different types
  const textSplitConfig = {
    lines: { duration: 0.8, stagger: 0.08 },
    words: { duration: 0.6, stagger: 0.06 },
    chars: { duration: 0.4, stagger: 0.01 },
  };

  // Default configuration
  const defaults = {
    type: "lines",
    start: "top 80%",
    end: null,
    scrub: false,
    ease: "expo.out",
    yPercent: 110,
    markers: false,
  };

  // Helper: Get config from element attributes
  const getConfig = (el) => {
    const type = el.dataset.anmType || defaults.type;
    const config = textSplitConfig[type] || textSplitConfig.lines;

    // Check if attributes exist before parsing (to allow 0 as valid value)
    const hasDuration = el.hasAttribute("data-anm-duration");
    const hasStagger = el.hasAttribute("data-anm-stagger");
    const hasYPercent = el.hasAttribute("data-anm-y-percent");

    return {
      type: type,
      start: el.dataset.anmStart || defaults.start,
      end: el.dataset.anmEnd || defaults.end,
      scrub:
        el.dataset.anmScrub === "true" ||
        parseFloat(el.dataset.anmScrub) ||
        defaults.scrub,
      duration: hasDuration
        ? parseFloat(el.dataset.anmDuration)
        : config.duration,
      ease: el.dataset.anmEase || defaults.ease,
      stagger: hasStagger ? parseFloat(el.dataset.anmStagger) : config.stagger,
      yPercent: hasYPercent
        ? parseFloat(el.dataset.anmYPercent)
        : defaults.yPercent,
      markers: el.dataset.anmMarkers === "true" || defaults.markers,
    };
  };

  // Helper: Check if disabled on current viewport
  const isDisabled = (el) => {
    const disable = el.dataset.anmDisable;
    if (!disable) return false;

    const breakpoints = {
      mobile: "(max-width: 479px)",
      tablet: "(max-width: 991px)",
      landscape: "(orientation: landscape) and (max-width: 767px)",
      desktop: "(min-width: 992px)",
    };

    return disable
      .split(",")
      .some(
        (v) =>
          breakpoints[v.trim()] &&
          window.matchMedia(breakpoints[v.trim()]).matches
      );
  };

  // Wait for fonts to load before splitting
  document.fonts.ready.then(() => {
    // Setup each element
    elements.forEach((element) => {
      if (isDisabled(element)) return;

      const config = getConfig(element);

      // Get target elements for text splitting
      // If data-anm-target is specified, use those elements, otherwise use the element itself
      const targetSelector = element.dataset.anmTarget;
      let textTargets;

      if (targetSelector) {
        // User specified custom selector - find elements within the container
        textTargets = Array.from(element.querySelectorAll(targetSelector));
        if (textTargets.length === 0) {
          console.warn(
            `[Text Reveal] No elements found for selector: ${targetSelector}`
          );
          textTargets = [element];
        }
      } else {
        // Default: animate the element itself
        textTargets = [element];
      }

      // Process each target element
      textTargets.forEach((textElement) => {
        animateTextElement(textElement, element, config);
      });
    });
  });

  // Helper function to animate individual text elements
  function animateTextElement(textElement, triggerElement, config) {
    // Determine split types based on animation type
    const typesToSplit =
      config.type === "lines"
        ? ["lines"]
        : config.type === "words"
          ? ["lines", "words"]
          : ["lines", "words", "chars"];

    // Split text with masking
    SplitText.create(textElement, {
      type: typesToSplit.join(","),
      mask: "lines",
      autoSplit: true,
      linesClass: "split-line",
      wordsClass: "split-word",
      charsClass: "split-char",
      onSplit: function (instance) {
        // Get targets based on animation type
        const targets = instance[config.type];

        // CRITICAL: Set initial position BEFORE making visible to prevent FOUC
        // This ensures text is already below the mask when visibility is applied
        gsap.set(targets, {
          yPercent: config.yPercent,
          force3D: true,
        });

        // Now that text is positioned behind the mask, make it visible
        gsap.set(textElement, { autoAlpha: 1 });

        return gsap.to(targets, {
          yPercent: 0,
          duration: config.duration,
          stagger: config.stagger,
          ease: config.ease,
          force3D: true,
          scrollTrigger: {
            trigger: triggerElement,
            start: () => `clamp(${config.start})`,
            end: () => config.end,
            scrub: config.scrub,
            once: true,
            invalidateOnRefresh: true,
            markers: config.markers,
            onEnter: () => {
              triggerElement.dispatchEvent(
                new CustomEvent("anm-scroll-text-reveal-enter", {
                  detail: { element: textElement },
                })
              );
            },
          },
          onComplete: () => {
            triggerElement.dispatchEvent(
              new CustomEvent("anm-scroll-text-reveal-complete", {
                detail: { element: textElement },
              })
            );
          },
        });
      },
    });
  }

  let resizeTimer,
    lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (
        window.matchMedia("(hover: none)").matches &&
        window.innerWidth === lastW
      )
        return;
      lastW = window.innerWidth;
      ScrollTrigger.refresh();
    }, 250);
  });
}

// Wait for GSAP, ScrollTrigger, and SplitText to load
function waitForGSAP(callback, attempts = 0) {
  if (
    typeof gsap !== "undefined" &&
    typeof ScrollTrigger !== "undefined" &&
    typeof SplitText !== "undefined"
  ) {
    callback();
  } else if (attempts < 50) {
    setTimeout(() => waitForGSAP(callback, attempts + 1), 100);
  } else {
    console.warn("GSAP, ScrollTrigger, or SplitText not found");
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () =>
    waitForGSAP(initScrollTextReveal)
  );
} else {
  waitForGSAP(initScrollTextReveal);
}

// Public API
window.Anm = window.Anm || {};
window.Anm.ScrollTextReveal = {
  refresh: () => {
    if (window.Anm.ScrollTextReveal._cleanup) {
      window.Anm.ScrollTextReveal._cleanup();
    }
    waitForGSAP(initScrollTextReveal);
  },
};
