// Injected into every page of a take (plain JS: serialized as a string, not transpiled).
// Headless Chrome draws no mouse cursor, so this mirrors the app's real CSS cursor under the
// pointer (arrow, hand, I-beam, or a custom url() cursor) and shows a soft ring on click.
(function () {
  function svg(s) { return "data:image/svg+xml," + encodeURIComponent(s); }
  var ARROW = svg("<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><path d='M6 3.5v19.2l4.6-4.4 2.9 6.6 3.3-1.4-2.9-6.5h6.4z' fill='#111' stroke='#fff' stroke-width='1.6' stroke-linejoin='round'/></svg>");
  var HAND = svg("<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><path d='M10.5 4.2c1 0 1.8.8 1.8 1.8v6.3l.4-.1c.4-1 1.6-1.4 2.5-.9.4-.8 1.5-1.2 2.4-.7.5-.6 1.5-.8 2.2-.3.6.3 1 1 1 1.7v5.6c0 3.6-2.6 6.4-6.2 6.4h-1.5c-2 0-3.5-.9-4.6-2.5L5 16.6c-.6-.9-.3-2 .6-2.5.8-.4 1.8-.2 2.3.5l.8 1.1V6c0-1 .8-1.8 1.8-1.8z' fill='#fff' stroke='#111' stroke-width='1.5' stroke-linejoin='round'/></svg>");
  var BEAM = svg("<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><path d='M10 5h3l1 1 1-1h3M14 6v16M10 23h3l1-1 1 1h3' fill='none' stroke='#fff' stroke-width='3.2' stroke-linecap='round'/><path d='M10 5h3l1 1 1-1h3M14 6v16M10 23h3l1-1 1 1h3' fill='none' stroke='#111' stroke-width='1.5' stroke-linecap='round'/></svg>");
  var URL_RE = /url\("?(data:image\/svg\+xml[^")]+)"?\)\s*(\d+)\s+(\d+)/;

  function boot() {
    if (document.getElementById("__cur")) return;
    var c = document.createElement("img");
    c.id = "__cur";
    c.style.cssText = "position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)";
    var ring = document.createElement("div");
    ring.style.cssText = "position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2.5px solid rgba(255,255,255,.85);z-index:2147483646;pointer-events:none;opacity:0";
    document.documentElement.appendChild(ring);
    document.documentElement.appendChild(c);
    var x = -100, y = -100;
    function place() {
      var el = document.elementFromPoint(x, y);
      var css = el ? getComputedStyle(el).cursor : "default";
      var m = css.match(URL_RE), pick;
      if (m) pick = [m[1], +m[2], +m[3]];
      else if (css === "pointer") pick = [HAND, 10, 4];
      else if (css === "text") pick = [BEAM, 14, 14];
      else pick = [ARROW, 6, 3];
      if (c.getAttribute("src") !== pick[0]) c.setAttribute("src", pick[0]);
      c.style.transform = "translate(" + (x - pick[1]) + "px," + (y - pick[2]) + "px)";
    }
    addEventListener("mousemove", function (e) { x = e.clientX; y = e.clientY; place(); }, true);
    addEventListener("mousedown", function (e) {
      ring.style.left = e.clientX + "px";
      ring.style.top = e.clientY + "px";
      ring.animate([{ opacity: 0.9, transform: "scale(.35)" }, { opacity: 0, transform: "scale(1.15)" }], { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)" });
    }, true);
    setInterval(place, 120);
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", boot);
  else boot();
})();
