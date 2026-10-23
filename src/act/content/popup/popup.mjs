/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Act toolbar popup: Actuent search and Act settings.

import {
  Actuent,
  browserWindow,
  handleLinks,
  renderResults,
} from "chrome://act/content/shared/actuent-ui.mjs";

const { ActPrefs, watchPrefs } = ChromeUtils.importESModule(
  "resource://act/ActPrefs.sys.mjs"
);

const win = browserWindow();
const $ = id => document.getElementById(id);

let currentView = "explore";
let searchAbort = null;

function openLink(url, { background = false } = {}) {
  win.ActBrowser.openLink(url, { background });
  if (!background) {
    win.ActPopup.close();
  }
}

function showView(view) {
  if (view == "explore" && !ActPrefs.actuentEnabled) {
    view = "off";
  }
  currentView = view;
  for (let section of document.querySelectorAll(".view")) {
    section.hidden = section.id != `view-${view}`;
  }
  $("toggle-settings").classList.toggle("active", view == "settings");
  $("heading").textContent = view == "settings" ? "Settings" : "Explore";
  if (view == "settings") {
    loadSettings();
  }
}

function focus() {
  if (currentView == "explore") {
    $("query").focus();
    $("query").select();
  }
}

// --- Explore -------------------------------------------------------------------

async function search(query) {
  query = (query ?? $("query").value).trim();
  $("query").value = query;
  showView("explore");
  if (!query) {
    $("results").replaceChildren();
    $("status").textContent = "";
    return;
  }

  searchAbort?.abort();
  let abort = (searchAbort = new AbortController());
  $("status").textContent = "Searching…";

  let result;
  try {
    result = await Actuent.search(query, {
      city: $("city").value.trim(),
      openNow: $("open-now").checked,
      kind: $("news").checked ? "news" : "web",
      limit: 12,
      signal: abort.signal,
    });
  } catch (e) {
    if (e.name != "AbortError") {
      $("status").textContent = e.message;
    }
    return;
  }
  if (abort.signal.aborted) {
    return;
  }
  $("status").textContent = renderResults($("results"), result, {
    openLink,
    onSearch: search,
  });
  $("results").scrollTop = 0;
}

// --- Settings ------------------------------------------------------------------

function loadSettings() {
  for (let input of document.querySelectorAll("[data-pref]")) {
    input.checked = Services.prefs.getBoolPref(input.dataset.pref, false);
  }
  $("compact-toggle").checked = ActPrefs.compactMode;
  $("version").textContent = `built on Firefox ${Services.appinfo.version}`;
}

// --- Wiring --------------------------------------------------------------------

$("toggle-settings").addEventListener("click", () => {
  showView(currentView == "settings" ? "explore" : "settings");
  focus();
});
$("turn-on").addEventListener("click", () => {
  Services.prefs.setBoolPref("act.actuent.enabled", true);
  showView("explore");
  focus();
});
$("explore-form").addEventListener("submit", e => {
  e.preventDefault();
  search();
});
for (let id of ["open-now", "news"]) {
  $(id).addEventListener("change", () => search());
}
for (let input of document.querySelectorAll("[data-pref]")) {
  input.addEventListener("change", () => {
    Services.prefs.setBoolPref(input.dataset.pref, input.checked);
  });
}
$("compact-toggle").addEventListener("change", e => {
  win.ActBrowser.setCompactMode(e.target.checked);
});
handleLinks(document, openLink);

let unwatch = watchPrefs(
  [
    "act.actuent.enabled",
    "act.compactMode",
    "act.workspaces.enabled",
    "act.layout.sidebarToolbar",
    "act.extensions.inSidebar",
    "act.newtab.enabled",
    "sidebar.verticalTabs",
  ],
  () => showView(currentView == "off" ? "explore" : currentView)
);
window.addEventListener("unload", unwatch, { once: true });

showView("explore");

window.ActPopupUI = {
  ready: true,
  showView,
  focus,
  search,
};
win.ActPopup?._uiReady(window.ActPopupUI);
