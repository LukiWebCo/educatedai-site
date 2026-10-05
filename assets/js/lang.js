/* educatedai.org: language preference, runs before paint.
   First visit: Spanish browsers get /es/; anyone who lands on a page keeps its language.
   After that the choice lives in localStorage["eai.lang"] (set by the EN | ES toggle). Nothing leaves the browser. */
(function () {
  var d = document.documentElement;
  d.className = d.className.replace(/\bno-js\b/, "js");
  var here = d.lang === "es" ? "es" : "en";
  var pref = null;
  try { pref = localStorage.getItem("eai.lang"); } catch (e) { return; }
  if (pref !== "en" && pref !== "es") {
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    pref = /^es\b/i.test(nav) ? "es" : here;
    try { localStorage.setItem("eai.lang", pref); } catch (e) { return; }
  }
  if (pref === here) return;
  var alt = document.querySelector('link[rel="alternate"][hreflang="' + pref + '"]');
  if (!alt) return;
  var u = new URL(alt.href);
  if (u.pathname !== location.pathname) location.replace(u.pathname + location.search + location.hash);
})();
