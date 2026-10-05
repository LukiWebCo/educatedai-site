/* educatedai.org: the 18+ notice, the language toggle and the film player.
   Every page works without this file except the player's extras. No network calls, no tracking. */
(function () {
  "use strict";

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return v; }

  /* -- EN | ES toggle: remember the choice, then follow the link */
  document.querySelectorAll("[data-setlang]").forEach(function (a) {
    a.addEventListener("click", function () { store("eai.lang", a.getAttribute("data-setlang")); });
  });

  /* -- 18+ notice: first visit only; the answer stays in localStorage */
  var gate = document.getElementById("age-gate");
  var gateOpen = false;
  var waiting = [];
  function afterGate(fn) { if (gateOpen) waiting.push(fn); else fn(); }
  if (gate && store("eai.age_ok") !== "1" && typeof gate.showModal === "function") {
    gateOpen = true;
    document.documentElement.classList.add("gated");
    gate.showModal();
    gate.addEventListener("cancel", function (e) { e.preventDefault(); });
    var ok = gate.querySelector("[data-gate-ok]");
    ok.focus();
    ok.addEventListener("click", function () {
      store("eai.age_ok", "1");
      gate.close();
      gateOpen = false;
      document.documentElement.classList.remove("gated");
      waiting.splice(0).forEach(function (fn) { fn(); });
    });
  }

  /* -- film player */
  document.querySelectorAll("[data-player]").forEach(function (fig) {
    var video = fig.querySelector("video");
    var data;
    try { data = JSON.parse(fig.querySelector("[data-sources]").textContent); } catch (e) { return; }
    var soundBtn = fig.querySelector("[data-sound]");
    var errorBox = fig.querySelector("[data-error]");
    var bar = fig.querySelector("[data-bar]");
    var state = { voice: fig.getAttribute("data-voice"), cut: fig.getAttribute("data-cut"), aspect: null, sound: false };
    var tall = window.matchMedia("(max-width: 720px) and (orientation: portrait), (max-aspect-ratio: 4/5)");

    function url(v, c, a) {
      var m = data.mp4 || {};
      var langs = [v, "en", "es"], cuts = [c, "60", "30"], aspects = [a, "16x9", "9x16"];
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) {
        var u = ((m[langs[i]] || {})[cuts[j]] || {})[aspects[k]];
        if (u) return u;
      }
      return "";
    }

    function setTracks() {
      var showing = null;
      Array.prototype.forEach.call(video.textTracks, function (tt) { if (tt.mode === "showing") showing = tt.language; });
      fig.querySelectorAll("track").forEach(function (t) { t.remove(); });
      ["en", "es"].forEach(function (l) {
        var src = ((data.vtt || {})[l] || {})[state.cut];
        if (!src) return;
        var t = document.createElement("track");
        t.kind = "subtitles"; t.srclang = l; t.label = (data.labels || {})[l] || l; t.src = src;
        video.appendChild(t);
      });
      if (showing) {
        // captions follow the voice: if a track was on, switch it to the new voice language
        setTimeout(function () {
          Array.prototype.forEach.call(video.textTracks, function (tt) { tt.mode = tt.language === state.voice ? "showing" : "disabled"; });
        }, 0);
      }
    }

    function load(keepTime) {
      var t = keepTime ? video.currentTime : 0;
      var wasPlaying = !video.paused;
      var src = url(state.voice, state.cut, state.aspect);
      fig.setAttribute("data-aspect", state.aspect);
      fig.setAttribute("data-voice", state.voice);
      fig.setAttribute("data-cut", state.cut);
      video.poster = (data.poster || {})[state.aspect] || video.poster;
      errorBox.hidden = true;
      video.querySelectorAll("source").forEach(function (s) { s.remove(); });
      video.src = src;
      setTracks();
      video.load();
      if (t) video.addEventListener("loadedmetadata", function once() { video.removeEventListener("loadedmetadata", once); try { video.currentTime = Math.min(t, video.duration || t); } catch (e) {} });
      if (wasPlaying || !state.sound) afterGate(play);
      sync();
    }

    function play() {
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay refused: the controls are there */ video.controls = true; soundBtn.hidden = true; });
    }

    function sync() {
      bar.querySelectorAll("[data-voice-btn]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-voice-btn") === state.voice)); });
      bar.querySelectorAll("[data-cut-btn]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-cut-btn") === state.cut)); });
    }

    // muted autoplay with a big "tap for sound"; native controls come back once the sound is on
    video.muted = true;
    video.controls = false;
    soundBtn.hidden = false;
    bar.hidden = false;
    state.aspect = tall.matches ? "9x16" : "16x9";
    load(false);

    function soundOn() {
      state.sound = true;
      soundBtn.hidden = true;
      video.muted = false;
      video.loop = false;
      video.controls = true;
      video.currentTime = 0;
      play();
    }
    soundBtn.addEventListener("click", soundOn);
    video.addEventListener("click", function () { if (!state.sound) soundOn(); });

    bar.querySelectorAll("[data-voice-btn]").forEach(function (b) {
      b.addEventListener("click", function () { state.voice = b.getAttribute("data-voice-btn"); load(true); });
    });
    bar.querySelectorAll("[data-cut-btn]").forEach(function (b) {
      b.addEventListener("click", function () { state.cut = b.getAttribute("data-cut-btn"); load(false); });
    });
    var onShape = function () {
      var a = tall.matches ? "9x16" : "16x9";
      if (a !== state.aspect) { state.aspect = a; load(true); }
    };
    if (tall.addEventListener) tall.addEventListener("change", onShape);

    video.addEventListener("error", function () { errorBox.hidden = false; soundBtn.hidden = true; }, true);
    video.addEventListener("playing", function () { errorBox.hidden = true; });
  });
})();
