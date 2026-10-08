/* Stooorna section speed: pause heavy refresh while a section opens, then resume. */
(function () {
  if (window.__stooornaSpeedOn) return;
  window.__stooornaSpeedOn = true;
  var hold = 0;
  function mark() {
    hold = Date.now() + 700;
    window.__stooornaSectionBusy = true;
    window.setTimeout(function () {
      if (Date.now() >= hold) window.__stooornaSectionBusy = false;
    }, 720);
  }
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('button, a, [role="button"]')) mark();
  }, true);
  var orig = window.setInterval;
  window.setInterval = function (fn, ms) {
    var wrapped = function () {
      if (window.__stooornaSectionBusy && ms < 8000) return;
      return fn.apply(this, arguments);
    };
    return orig(wrapped, ms);
  };
})();
