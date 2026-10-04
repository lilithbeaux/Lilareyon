/* ============================================================
   LILITH BEAUX — MATRIX DRIP (Blue Lightning retrofit)
   Cyan / crimson / plum digital rain, glyph heads bright cyan.
   Fixed background layer behind page content. Ported from the
   Obsidian Rose implementation; respects motion toggle + reduced
   motion.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('matrix-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var width, height, fontSize, columns, drops;

  // Katakana + sigil glyphs
  var glyphs = 'アカサタナハマヤラワ01X*#@∞Ωμφ∫∂∇∴↑↓→↔♂♀';
  var glyphArray = glyphs.split('');

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    fontSize = Math.max(12, Math.floor(width / 100));
    columns = Math.floor(width / fontSize);
    drops = new Array(columns).fill(1).map(function () { return Math.random() * -50; });
  }
  resize();
  window.addEventListener('resize', resize);

  function motionOff() {
    return document.documentElement.getAttribute('data-motion') === 'off';
  }

  // Blue Lightning palette: cyan bodies, crimson accents, plum trails.
  function getDripColor() {
    var r = Math.random();
    if (r < 0.6) return 'rgba(0, 239, 255, 0.13)';    // cyan
    if (r < 0.85) return 'rgba(255, 47, 47, 0.20)';   // crimson
    return 'rgba(189, 147, 249, 0.10)';               // plum
  }

  var typingMode = false;
  var typingSpeed = 1;

  document.addEventListener('keydown', function () { typingMode = true; typingSpeed = 1.5; });
  document.addEventListener('keyup', function () { typingMode = false; typingSpeed = 1; });

  function draw() {
    // Fade trail — clears with the page background so nothing milks up.
    ctx.fillStyle = 'rgba(10, 10, 12, 0.08)';
    ctx.fillRect(0, 0, width, height);

    ctx.font = fontSize + "px 'Geist Mono', 'Courier New', monospace";

    for (var i = 0; i < columns; i++) {
      var text = glyphArray[Math.floor(Math.random() * glyphArray.length)];
      var x = i * fontSize;
      var y = drops[i] * fontSize;

      // Head of the drip — bright cyan
      ctx.fillStyle = 'rgba(0, 239, 255, 0.9)';
      ctx.fillText(text, x, y);

      // Body — dimmer
      ctx.fillStyle = getDripColor();
      ctx.fillText(text, x, y + fontSize);

      drops[i] += typingSpeed * (0.5 + Math.random() * 0.5);

      // Reset when drip goes off screen
      if (y > height && Math.random() > 0.975) {
        drops[i] = Math.random() * -20;
      }
    }
  }

  var lastFrame = 0;
  function loop(timestamp) {
    if (!motionOff()) {
      var frameInterval = typingMode ? 33 : 66;
      if (timestamp - lastFrame >= frameInterval) {
        draw();
        lastFrame = timestamp;
      }
    } else {
      // When motion stops, clear the canvas so it doesn't freeze mid-trail.
      ctx.clearRect(0, 0, width, height);
    }
    requestAnimationFrame(loop);
  }

  // Respect reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  requestAnimationFrame(loop);
})();
