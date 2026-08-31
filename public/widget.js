(function () {
  "use strict";

  // Trello M5 -- the bootstrap script a merchant pastes into their own
  // site. Deliberately plain, dependency-free JS: it has to run correctly
  // on an arbitrary third-party page regardless of that page's own
  // framework, bundler, or CSP -- the same "zero assumptions about the
  // caller" posture /api/chat/ and /c/[trackingId] already take for their
  // own public surfaces. No build step: this file is shipped as-is from
  // public/, so what's here is exactly what a browser runs.

  var currentScript = document.currentScript;
  if (!currentScript) return;

  var companySlug = currentScript.getAttribute("data-company");
  var agentSlug = currentScript.getAttribute("data-agent");
  if (!companySlug || !agentSlug) {
    console.error("Staffra widget: data-company and data-agent are required on the <script> tag.");
    return;
  }

  // The Staffra origin is derived from the script's own src, never
  // hardcoded -- the same file works unmodified in local dev and
  // production, whatever domain it's actually served from.
  var staffraOrigin = new URL(currentScript.src).origin;
  var chatUrl = staffraOrigin + "/talk/" + encodeURIComponent(companySlug) + "/" + encodeURIComponent(agentSlug) + "?embedded=1";

  var LAUNCHER_ID = "staffra-widget-launcher";
  var PANEL_ID = "staffra-widget-panel";

  var style = document.createElement("style");
  style.textContent = [
    "#" + LAUNCHER_ID + " {",
    "  position: fixed; bottom: 20px; right: 20px; z-index: 2147483000;",
    "  width: 60px; height: 60px; border-radius: 9999px;",
    "  background: #3525cd; border: none; cursor: pointer;",
    "  box-shadow: 0 10px 30px rgba(0,0,0,0.2);",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: transform 0.15s ease;",
    "}",
    "#" + LAUNCHER_ID + ":hover { transform: scale(1.06); }",
    "#" + LAUNCHER_ID + " svg { width: 28px; height: 28px; }",
    "#" + PANEL_ID + " {",
    "  position: fixed; bottom: 92px; right: 20px; z-index: 2147483000;",
    "  width: 380px; height: min(600px, 80vh); max-width: calc(100vw - 40px);",
    "  border-radius: 16px; overflow: hidden;",
    "  box-shadow: 0 20px 50px rgba(0,0,0,0.25);",
    "  border: none; display: none;",
    "}",
    "#" + PANEL_ID + ".staffra-widget-open { display: block; }",
    "#" + PANEL_ID + " iframe { width: 100%; height: 100%; border: none; display: block; }",
    "@media (max-width: 480px) {",
    "  #" + PANEL_ID + " {",
    "    inset: 0; bottom: 0; right: 0; width: 100%; height: 100%; max-width: 100%;",
    "    border-radius: 0;",
    "  }",
    "}",
  ].join("\n");
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.id = LAUNCHER_ID;
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>' +
    "</svg>";

  var panel = document.createElement("div");
  panel.id = PANEL_ID;

  var iframe = null;

  function open() {
    if (!iframe) {
      // Lazily created on first open, not on page load -- a merchant's
      // site shouldn't pay for an iframe load before a visitor ever
      // clicks the launcher.
      iframe = document.createElement("iframe");
      iframe.src = chatUrl;
      iframe.title = "Chat";
      panel.appendChild(iframe);
    }
    panel.classList.add("staffra-widget-open");
  }

  function close() {
    panel.classList.remove("staffra-widget-open");
  }

  function toggle() {
    if (panel.classList.contains("staffra-widget-open")) {
      close();
    } else {
      open();
    }
  }

  launcher.addEventListener("click", toggle);

  // Only accept close requests from the iframe we ourselves created --
  // the payload is harmless either way, but a receiver of arbitrary
  // postMessage traffic on someone else's page should always check
  // event.origin, not just event.data.
  window.addEventListener("message", function (event) {
    if (event.origin !== staffraOrigin) return;
    if (event.data && event.data.type === "staffra-chat:close") close();
  });

  document.body.appendChild(panel);
  document.body.appendChild(launcher);
})();
