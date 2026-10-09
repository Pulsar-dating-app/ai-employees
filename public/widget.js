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

  // Merchant-configurable teaser bubble text (e.g. data-greeting="Need help
  // finding your size?"). The server-generated snippet always sets this now
  // (see embed-snippet.ts's resolveDefaultGreeting) -- the hardcoded string
  // below only ever fires for a snippet with no data-greeting attribute at
  // all, i.e. one generated before that existed. Portuguese, matching the
  // per-agent defaults it stands in for -- deliberately no mention of
  // "AI"/"chatbot"/"assistant" in either, matching this product's own
  // customer-facing language rules.
  var greeting = currentScript.getAttribute("data-greeting") || "Posso ajudar?";
  var TEASER_DISMISSED_KEY = "staffra-widget-teaser-dismissed:" + companySlug + ":" + agentSlug;

  // Merchant-uploaded launcher, set via data-launcher-type ("video" or
  // "image") + data-launcher-src on the script tag -- both generated
  // together from the Customize screen, never hand-written. Any other/no
  // value for data-launcher-type (including an older snippet pasted before
  // this existed) falls back to the shared default character video, so a
  // snippet copied before this feature shipped keeps working unmodified.
  var launcherType = currentScript.getAttribute("data-launcher-type");
  var launcherSrc = currentScript.getAttribute("data-launcher-src");
  var useCustomLauncher = (launcherType === "video" || launcherType === "image") && !!launcherSrc;

  // Merchant-adjustable position, set via data-position/data-offset-bottom
  // on the script tag (Customize screen) -- for a site where the default
  // bottom-right corner covers something else (a mobile bottom nav bar was
  // the reported case). Missing/invalid values fall back to the original
  // fixed position exactly, so a snippet pasted before this existed keeps
  // rendering unmodified.
  var isLeft = currentScript.getAttribute("data-position") === "bottom-left";
  var sideProp = isLeft ? "left" : "right";
  var offsetBottomRaw = parseInt(currentScript.getAttribute("data-offset-bottom"), 10);
  var offsetBottom = isNaN(offsetBottomRaw) || offsetBottomRaw < 0 ? 0 : offsetBottomRaw;

  // The Staffra origin is derived from the script's own src, never
  // hardcoded -- the same file works unmodified in local dev and
  // production, whatever domain it's actually served from.
  var staffraOrigin = new URL(currentScript.src).origin;
  var chatUrl = staffraOrigin + "/talk/" + encodeURIComponent(companySlug) + "/" + encodeURIComponent(agentSlug) + "?embedded=1";

  var LAUNCHER_ID = "staffra-widget-launcher";
  var PANEL_ID = "staffra-widget-panel";
  var TEASER_ID = "staffra-widget-teaser";
  var WRAP_ID = "staffra-widget-launcher-wrap";
  var MINIMIZE_ID = "staffra-widget-minimize";
  var RESTORE_ID = "staffra-widget-restore";
  var MINIMIZED_KEY = "staffra-widget-minimized:" + companySlug + ":" + agentSlug;

  // Every "bottom" value below is the original fixed pixel plus the
  // merchant's offset, so raising `offsetBottom` lifts the whole cluster
  // (launcher, panel, teaser) together, not just the launcher on its own.
  var launcherBottom = 20 + offsetBottom;
  var panelBottom = launcherBottom;
  var teaserBottom = 34 + offsetBottom;
  var mobileLauncherBottom = 16 + offsetBottom;
  var mobileTeaserBottom = 24 + offsetBottom;
  var MOBILE_QUERY = "(max-width: 480px)";
  var MOBILE_TEASER_MS = 6000;
  var TEASER_SEEN_KEY = "staffra-widget-teaser-seen:" + companySlug + ":" + agentSlug;

  var style = document.createElement("style");
  style.textContent = [
    "#" + WRAP_ID + " {",
    "  position: fixed; bottom: " + launcherBottom + "px; " + sideProp + ": 20px; z-index: 2147483000;",
    "  transition: transform 0.2s ease, opacity 0.2s ease;",
    "}",
    "#" + WRAP_ID + ".staffra-widget-hidden { display: none; }",
    "#" + LAUNCHER_ID + " {",
    "  position: relative; padding: 0;",
    "  width: 72px; height: 72px; border-radius: 9999px; overflow: hidden;",
    // White, not indigo -- the character video's own tones are close
    // enough to indigo that the two blended together. White also stays
    // the fallback shown if the video can't load/play at all (e.g.
    // WebM-with-alpha isn't supported in every browser), so it's never a
    // blank/broken-looking button either way.
    "  background: #ffffff; border: none; cursor: pointer;",
    "  box-shadow: 0 10px 30px rgba(0,0,0,0.2);",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: transform 0.2s ease, opacity 0.2s ease;",
    "}",
    "@media (hover: hover) { #" + LAUNCHER_ID + ":hover { transform: scale(1.06); } }",
    "#" + MINIMIZE_ID + " {",
    "  position: absolute; top: -4px; " + (isLeft ? "right" : "left") + ": -4px; z-index: 1;",
    "  width: 22px; height: 22px; padding: 0; border: none; border-radius: 9999px; cursor: pointer;",
    "  background: #ffffff; color: #464555; box-shadow: 0 2px 8px rgba(0,0,0,0.2);",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: opacity 0.15s ease;",
    "}",
    "#" + MINIMIZE_ID + " svg { width: 12px; height: 12px; }",
    "@media (hover: hover) {",
    "  #" + MINIMIZE_ID + " { opacity: 0; }",
    "  #" + WRAP_ID + ":hover #" + MINIMIZE_ID + ", #" + MINIMIZE_ID + ":focus-visible { opacity: 1; }",
    "}",
    "#" + RESTORE_ID + " {",
    "  position: fixed; bottom: " + (launcherBottom + 14) + "px; " + sideProp + ": 0; z-index: 2147483000;",
    "  width: 26px; height: 44px; padding: 0; border: none; cursor: pointer;",
    "  border-radius: " + (isLeft ? "0 12px 12px 0" : "12px 0 0 12px") + ";",
    "  background: #ffffff; color: #3525cd; box-shadow: 0 4px 14px rgba(0,0,0,0.18);",
    "  display: none; align-items: center; justify-content: center;",
    "}",
    "#" + RESTORE_ID + ".staffra-widget-visible { display: flex; }",
    "#" + RESTORE_ID + " svg { width: 16px; height: 16px; }",
    "#" + LAUNCHER_ID + " video, #" + LAUNCHER_ID + " img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }",
    "#" + PANEL_ID + " {",
    "  position: fixed; bottom: " + panelBottom + "px; " + sideProp + ": 20px; z-index: 2147483000;",
    "  width: 380px; height: min(600px, 80vh); max-width: calc(100vw - 40px);",
    "  border-radius: 16px; overflow: hidden;",
    "  box-shadow: 0 20px 50px rgba(0,0,0,0.25);",
    "  border: none; display: none;",
    "}",
    "#" + PANEL_ID + ".staffra-widget-open { display: block; }",
    "#" + PANEL_ID + " iframe { width: 100%; height: 100%; border: none; display: block; }",
    "#" + TEASER_ID + " {",
    // Same side property as the launcher (not the opposite one) -- a bigger
    // offset (100 vs. the launcher's 20) is what opens the gap between
    // them, both still measured from the same edge.
    "  position: fixed; bottom: " + teaserBottom + "px; " + sideProp + ": 100px; z-index: 2147482999;",
    "  max-width: 220px; background: #ffffff; color: #191c1d;",
    "  border-radius: 16px; padding: 12px 36px 12px 16px;",
    "  box-shadow: 0 10px 30px rgba(0,0,0,0.15);",
    "  font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "  cursor: pointer; opacity: 0; transform: translateY(6px); pointer-events: none;",
    "  transition: opacity 0.25s ease, transform 0.25s ease;",
    "}",
    "#" + TEASER_ID + ".staffra-widget-visible { opacity: 1; transform: translateY(0); pointer-events: auto; }",
    "#" + TEASER_ID + "::after {",
    "  content: ''; position: absolute; " + sideProp + ": -6px; bottom: 24px;",
    "  width: 12px; height: 12px; background: #ffffff; transform: rotate(45deg);",
    "  box-shadow: " + (isLeft ? "-2px -2px 2px rgba(0,0,0,0.03);" : "2px -2px 2px rgba(0,0,0,0.03);"),
    "}",
    "#" + TEASER_ID + "-close {",
    "  position: absolute; top: 6px; right: 6px; width: 22px; height: 22px;",
    "  border: none; background: transparent; color: #777587; cursor: pointer;",
    "  border-radius: 9999px; font-size: 15px; line-height: 1; display: flex;",
    "  align-items: center; justify-content: center;",
    "}",
    "#" + TEASER_ID + "-close:hover { background: #f3f4f5; }",
    "@media " + MOBILE_QUERY + " {",
    "  #" + WRAP_ID + " {",
    "    " + sideProp + ": 16px; bottom: calc(" + mobileLauncherBottom + "px + env(safe-area-inset-bottom, 0px));",
    "  }",
    "  #" + WRAP_ID + ".staffra-widget-scrolling { transform: scale(0.75); opacity: 0.45; }",
    "  #" + LAUNCHER_ID + " { width: 56px; height: 56px; box-shadow: 0 6px 18px rgba(0,0,0,0.18); }",
    "  #" + RESTORE_ID + " { bottom: calc(" + (mobileLauncherBottom + 6) + "px + env(safe-area-inset-bottom, 0px)); }",
    "  #" + PANEL_ID + " {",
    "    inset: 0; bottom: 0; right: 0; width: 100%; height: 100%; height: 100dvh; max-width: 100%;",
    "    border-radius: 0;",
    "  }",
    "  #" + TEASER_ID + " {",
    "    " + sideProp + ": 82px; bottom: calc(" + mobileTeaserBottom + "px + env(safe-area-inset-bottom, 0px));",
    "    max-width: min(200px, calc(100vw - 104px)); padding: 8px 12px;",
    "    font-size: 13px; border-radius: 14px; box-shadow: 0 6px 18px rgba(0,0,0,0.14);",
    "  }",
    "  #" + TEASER_ID + "::after { bottom: 12px; width: 10px; height: 10px; " + sideProp + ": -5px; }",
    "  #" + TEASER_ID + "-close { display: none; }",
    "}",
  ].join("\n");
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.id = LAUNCHER_ID;
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  if (useCustomLauncher && launcherType === "image") {
    // A merchant-uploaded static image -- same circular treatment as the
    // video, just no autoplay/loop to manage.
    var launcherImg = document.createElement("img");
    launcherImg.src = launcherSrc;
    launcherImg.alt = "";
    launcher.appendChild(launcherImg);
  } else {
    // Looping character video: the shared default, or a merchant-uploaded
    // replacement when data-launcher-type="video". Built via DOM
    // properties, not an innerHTML string, so autoplay/loop/muted are real
    // IDL properties the browser respects immediately (a muted+autoplay
    // video is exempt from browser autoplay-blocking policies everywhere).
    // The launcher button's own white background (above) is what a visitor
    // sees if this video can't play at all -- still a clean, functional
    // button, never a blank/broken box.
    // launcherSrc is used whenever present, not just for a custom upload --
    // the server-generated snippet now also bakes in this agent's own
    // default classic video here (see embed-snippet.ts). The hardcoded
    // fallback only ever fires for a snippet pasted before either feature
    // existed, which has no data-launcher-src attribute at all.
    var launcherVideo = document.createElement("video");
    launcherVideo.src = launcherSrc || staffraOrigin + "/widget-launcher.webm";
    launcherVideo.autoplay = true;
    launcherVideo.loop = true;
    launcherVideo.muted = true;
    launcherVideo.playsInline = true;
    launcherVideo.setAttribute("aria-hidden", "true");
    launcher.appendChild(launcherVideo);
  }

  var CHEVRON_PATH = isLeft ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6";

  function svgIcon(d) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  var wrap = document.createElement("div");
  wrap.id = WRAP_ID;
  wrap.appendChild(launcher);

  var minimizeButton = document.createElement("button");
  minimizeButton.id = MINIMIZE_ID;
  minimizeButton.type = "button";
  minimizeButton.setAttribute("aria-label", "Hide chat button");
  minimizeButton.appendChild(svgIcon("M6 6l12 12M18 6L6 18"));
  wrap.appendChild(minimizeButton);

  var restoreButton = document.createElement("button");
  restoreButton.id = RESTORE_ID;
  restoreButton.type = "button";
  restoreButton.setAttribute("aria-label", "Show chat button");
  restoreButton.appendChild(svgIcon(CHEVRON_PATH));

  var panel = document.createElement("div");
  panel.id = PANEL_ID;

  // Speech-bubble teaser, shown once per browser (persisted via
  // localStorage, scoped per company+agent like the chat session id) so it
  // never nags a returning visitor. Text is merchant-configurable via
  // data-greeting on the script tag.
  var teaser = document.createElement("div");
  teaser.id = TEASER_ID;
  teaser.setAttribute("role", "button");
  teaser.setAttribute("tabindex", "0");
  var teaserText = document.createElement("span");
  teaserText.textContent = greeting;
  teaser.appendChild(teaserText);
  var teaserClose = document.createElement("button");
  teaserClose.id = TEASER_ID + "-close";
  teaserClose.type = "button";
  teaserClose.setAttribute("aria-label", "Dismiss");
  teaserClose.textContent = "×";
  teaser.appendChild(teaserClose);

  function dismissTeaser() {
    teaser.classList.remove("staffra-widget-visible");
    try {
      window.localStorage.setItem(TEASER_DISMISSED_KEY, "1");
    } catch {
      // Storage can be unavailable (private browsing, disabled by the host
      // page) -- the teaser just reappears next load, harmless.
    }
  }

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  }

  var lockedScroll = null;

  function lockPageScroll() {
    if (lockedScroll || !isMobile()) return;
    lockedScroll = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function unlockPageScroll() {
    if (!lockedScroll) return;
    document.documentElement.style.overflow = lockedScroll.html;
    document.body.style.overflow = lockedScroll.body;
    lockedScroll = null;
  }

  // Full-screen panel on mobile, kept fitted to the *visible* area. The
  // keyboard opened by the chat's input never resizes the iframe's own
  // viewport -- only this (host) page's visualViewport sees it, and iOS
  // additionally pans this page up to keep the input in view, pushing the
  // chat's header and messages off-screen. Pinning the panel to the visual
  // viewport makes the iframe shrink instead, so the chat inside keeps its
  // header, a scrollable message list, and the input right above the
  // keyboard (WhatsApp-style).
  function fitPanelToViewport() {
    var vv = window.visualViewport;
    if (!vv || !isMobile() || !panel.classList.contains("staffra-widget-open") || Math.abs(vv.scale - 1) > 0.01) {
      panel.style.top = "";
      panel.style.bottom = "";
      panel.style.height = "";
      return;
    }
    panel.style.top = vv.offsetTop + "px";
    panel.style.bottom = "auto";
    panel.style.height = vv.height + "px";
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitPanelToViewport);
    window.visualViewport.addEventListener("scroll", fitPanelToViewport);
  }

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
    wrap.classList.add("staffra-widget-hidden");
    restoreButton.classList.remove("staffra-widget-visible");
    lockPageScroll();
    fitPanelToViewport();
    dismissTeaser();
  }

  function close() {
    panel.classList.remove("staffra-widget-open");
    fitPanelToViewport();
    unlockPageScroll();
    wrap.classList.remove("staffra-widget-hidden");
    launcher.focus();
  }

  function minimize() {
    wrap.classList.add("staffra-widget-hidden");
    teaser.classList.remove("staffra-widget-visible");
    restoreButton.classList.add("staffra-widget-visible");
    try {
      window.sessionStorage.setItem(MINIMIZED_KEY, "1");
    } catch {}
  }

  function restore() {
    restoreButton.classList.remove("staffra-widget-visible");
    wrap.classList.remove("staffra-widget-hidden");
    launcher.focus();
    try {
      window.sessionStorage.removeItem(MINIMIZED_KEY);
    } catch {}
  }

  launcher.addEventListener("click", open);
  minimizeButton.addEventListener("click", function (event) {
    event.stopPropagation();
    minimize();
  });
  restoreButton.addEventListener("click", restore);
  teaser.addEventListener("click", open);
  teaser.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
  teaserClose.addEventListener("click", function (event) {
    event.stopPropagation();
    dismissTeaser();
  });

  function hideTeaserForSession() {
    teaser.classList.remove("staffra-widget-visible");
    try {
      window.sessionStorage.setItem(TEASER_SEEN_KEY, "1");
    } catch {}
  }

  var startMinimized;
  try {
    startMinimized = !!window.sessionStorage.getItem(MINIMIZED_KEY);
  } catch {
    startMinimized = false;
  }
  if (startMinimized) minimize();

  var alreadyDismissed;
  try {
    alreadyDismissed =
      !!window.localStorage.getItem(TEASER_DISMISSED_KEY) ||
      (isMobile() && !!window.sessionStorage.getItem(TEASER_SEEN_KEY));
  } catch {
    alreadyDismissed = false;
  }
  if (!alreadyDismissed && !startMinimized) {
    // A brief delay reads as a considered greeting, not an instant pop-up
    // shoved in the visitor's face the moment the page paints.
    setTimeout(function () {
      if (wrap.classList.contains("staffra-widget-hidden")) return;
      teaser.classList.add("staffra-widget-visible");
      if (isMobile()) setTimeout(hideTeaserForSession, MOBILE_TEASER_MS);
    }, 1200);
  }

  var scrollIdleTimer = null;
  window.addEventListener(
    "scroll",
    function () {
      if (!isMobile() || panel.classList.contains("staffra-widget-open")) return;
      wrap.classList.add("staffra-widget-scrolling");
      if (teaser.classList.contains("staffra-widget-visible")) hideTeaserForSession();
      clearTimeout(scrollIdleTimer);
      scrollIdleTimer = setTimeout(function () {
        wrap.classList.remove("staffra-widget-scrolling");
      }, 500);
    },
    { passive: true },
  );

  // Only accept close requests from the iframe we ourselves created --
  // the payload is harmless either way, but a receiver of arbitrary
  // postMessage traffic on someone else's page should always check
  // event.origin, not just event.data.
  window.addEventListener("message", function (event) {
    if (event.origin !== staffraOrigin) return;
    if (event.data && event.data.type === "staffra-chat:close") close();
  });

  document.body.appendChild(panel);
  document.body.appendChild(teaser);
  document.body.appendChild(wrap);
  document.body.appendChild(restoreButton);
})();
