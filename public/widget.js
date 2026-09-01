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
  // finding your size?"). Falls back to a generic default -- deliberately
  // no mention of "AI"/"chatbot"/"assistant" in either, matching this
  // product's own customer-facing language rules.
  var greeting = currentScript.getAttribute("data-greeting") || "Hi! 👋 Need help finding what you're looking for?";
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

  // The Staffra origin is derived from the script's own src, never
  // hardcoded -- the same file works unmodified in local dev and
  // production, whatever domain it's actually served from.
  var staffraOrigin = new URL(currentScript.src).origin;
  var chatUrl = staffraOrigin + "/talk/" + encodeURIComponent(companySlug) + "/" + encodeURIComponent(agentSlug) + "?embedded=1";

  var LAUNCHER_ID = "staffra-widget-launcher";
  var PANEL_ID = "staffra-widget-panel";
  var TEASER_ID = "staffra-widget-teaser";

  var style = document.createElement("style");
  style.textContent = [
    "#" + LAUNCHER_ID + " {",
    "  position: fixed; bottom: 20px; right: 20px; z-index: 2147483000;",
    "  width: 72px; height: 72px; border-radius: 9999px; overflow: hidden;",
    // White, not indigo -- the character video's own tones are close
    // enough to indigo that the two blended together. White also stays
    // the fallback shown if the video can't load/play at all (e.g.
    // WebM-with-alpha isn't supported in every browser), so it's never a
    // blank/broken-looking button either way.
    "  background: #ffffff; border: none; cursor: pointer;",
    "  box-shadow: 0 10px 30px rgba(0,0,0,0.2);",
    "  display: flex; align-items: center; justify-content: center;",
    "  transition: transform 0.15s ease;",
    "}",
    "#" + LAUNCHER_ID + ":hover { transform: scale(1.06); }",
    "#" + LAUNCHER_ID + " video, #" + LAUNCHER_ID + " img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }",
    "#" + PANEL_ID + " {",
    "  position: fixed; bottom: 92px; right: 20px; z-index: 2147483000;",
    "  width: 380px; height: min(600px, 80vh); max-width: calc(100vw - 40px);",
    "  border-radius: 16px; overflow: hidden;",
    "  box-shadow: 0 20px 50px rgba(0,0,0,0.25);",
    "  border: none; display: none;",
    "}",
    "#" + PANEL_ID + ".staffra-widget-open { display: block; }",
    "#" + PANEL_ID + " iframe { width: 100%; height: 100%; border: none; display: block; }",
    "#" + TEASER_ID + " {",
    "  position: fixed; bottom: 34px; right: 100px; z-index: 2147482999;",
    "  max-width: 220px; background: #ffffff; color: #191c1d;",
    "  border-radius: 16px; padding: 12px 36px 12px 16px;",
    "  box-shadow: 0 10px 30px rgba(0,0,0,0.15);",
    "  font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "  cursor: pointer; opacity: 0; transform: translateY(6px); pointer-events: none;",
    "  transition: opacity 0.25s ease, transform 0.25s ease;",
    "}",
    "#" + TEASER_ID + ".staffra-widget-visible { opacity: 1; transform: translateY(0); pointer-events: auto; }",
    "#" + TEASER_ID + "::after {",
    "  content: ''; position: absolute; right: -6px; bottom: 24px;",
    "  width: 12px; height: 12px; background: #ffffff; transform: rotate(45deg);",
    "  box-shadow: 2px -2px 2px rgba(0,0,0,0.03);",
    "}",
    "#" + TEASER_ID + "-close {",
    "  position: absolute; top: 6px; right: 6px; width: 22px; height: 22px;",
    "  border: none; background: transparent; color: #777587; cursor: pointer;",
    "  border-radius: 9999px; font-size: 15px; line-height: 1; display: flex;",
    "  align-items: center; justify-content: center;",
    "}",
    "#" + TEASER_ID + "-close:hover { background: #f3f4f5; }",
    "@media (max-width: 480px) {",
    "  #" + PANEL_ID + " {",
    "    inset: 0; bottom: 0; right: 0; width: 100%; height: 100%; max-width: 100%;",
    "    border-radius: 0;",
    "  }",
    // Beside the launcher has no room on a narrow viewport -- stack above
    // it instead, matching the mobile-fullscreen panel's own "reflow, don't
    // just shrink" approach.
    "  #" + TEASER_ID + " { bottom: 100px; right: 20px; left: 20px; max-width: none; }",
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
    var launcherVideo = document.createElement("video");
    launcherVideo.src = useCustomLauncher ? launcherSrc : staffraOrigin + "/widget-launcher.webm";
    launcherVideo.autoplay = true;
    launcherVideo.loop = true;
    launcherVideo.muted = true;
    launcherVideo.playsInline = true;
    launcherVideo.setAttribute("aria-hidden", "true");
    launcher.appendChild(launcherVideo);
  }

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
    dismissTeaser();
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

  var alreadyDismissed;
  try {
    alreadyDismissed = !!window.localStorage.getItem(TEASER_DISMISSED_KEY);
  } catch {
    alreadyDismissed = false;
  }
  if (!alreadyDismissed) {
    // A brief delay reads as a considered greeting, not an instant pop-up
    // shoved in the visitor's face the moment the page paints.
    setTimeout(function () {
      teaser.classList.add("staffra-widget-visible");
    }, 1200);
  }

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
  document.body.appendChild(launcher);
})();
