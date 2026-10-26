/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Act toolbar popup: Actuent search and Act settings.

import {
  handleLinks,
  renderResults,
} from "chrome://act/content/shared/actuent-ui.mjs";

const { Actuent } = ChromeUtils.importESModule(
  "resource://act/Actuent.sys.mjs"
);

const { ActPrefs, watchPrefs } = ChromeUtils.importESModule(
  "resource://act/ActPrefs.sys.mjs"
);
const { ActAgents } = ChromeUtils.importESModule(
  "resource://act/ActAgents.sys.mjs"
);
const { ActUpdater } = ChromeUtils.importESModule(
  "resource://act/ActUpdater.sys.mjs"
);
const { ActSearch } = ChromeUtils.importESModule(
  "resource://act/ActSearch.sys.mjs"
);
const { ActTabSync } = ChromeUtils.importESModule(
  "resource://act/ActTabSync.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);

// The browser window this popup belongs to.
const win = window.browsingContext.topChromeWindow;
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

const ideas = $("ideas");

function pressed(id) {
  return $(id).getAttribute("aria-pressed") == "true";
}

function queryIdea(text) {
  $("query").value = text;
  search(text);
}

// Icons the browser already has for these sites (from your history).
async function iconsFor(domains) {
  let icons = {};
  await Promise.all(
    domains.map(async domain => {
      try {
        let favicon = await PlacesUtils.favicons.getFaviconForPage(
          Services.io.newURI(`https://${domain}/`)
        );
        if (favicon?.dataURI?.spec) {
          icons[domain] = favicon.dataURI.spec;
        }
      } catch {}
    })
  );
  return icons;
}

async function search(query) {
  query = (query ?? $("query").value).trim();
  $("query").value = query;
  showView("explore");
  $("see-all").hidden = !query;
  if (!query) {
    $("results").replaceChildren(ideas);
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
      openNow: pressed("open-now"),
      kind: pressed("news") ? "news" : "web",
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
  let domains = [...new Set([...result.sites, ...result.products].map(r => r.domain).filter(Boolean))];
  let icons = await iconsFor(domains);
  if (abort.signal.aborted) {
    return;
  }
  $("status").textContent = renderResults($("results"), result, {
    openLink,
    onSearch: search,
    icons,
  });
  $("results").scrollTop = 0;
}

// --- Settings ------------------------------------------------------------------

function loadSettings() {
  for (let input of document.querySelectorAll("[data-pref]")) {
    input.checked = Services.prefs.getBoolPref(input.dataset.pref, false);
  }
  $("compact-toggle").checked = ActPrefs.compactMode;
  let ac = $("accent-color");
  if (ac) ac.value = Services.prefs.getStringPref("act.accentColor", "#6d5dfc");
  $("version").textContent = `built on Firefox ${Services.appinfo.version}`;

  showUpdateState();
  showSyncState().catch(e => console.error("Act: sync settings", e));

  let agents = ActPrefs.agentsEnabled;
  $("agent-setup").hidden = !agents;
  $("agent-status").textContent = agents
    ? `Listening on localhost:${ActPrefs.agentsPort}. Paste the command in a terminal, then restart your agent.`
    : "";
}

async function showSyncState() {
  let signedIn = ActTabSync.signedIn;
  $("sync-status").textContent = signedIn
    ? `Signed in as ${ActTabSync.email}. Open tabs, tab groups, bookmarks, history, passwords and settings sync with your other computers.`
    : "Sign in with a Mozilla account to carry your open tabs and tab groups over to your other computers, along with bookmarks, history and passwords.";
  $("sync-account").textContent = signedIn ? "Account and sync settings" : "Sign in to sync";
  $("sync-account").classList.toggle("primary", !signedIn);

  let rows = [];
  for (let device of await ActTabSync.devices()) {
    let row = document.createElement("div");
    row.className = "row sync-device";
    let text = document.createElement("span");
    text.textContent = `${device.name}: ${ActTabSync.describe(device)}`;
    let open = document.createElement("button");
    open.textContent = "Open";
    open.addEventListener("click", () => {
      ActTabSync.openDevice(win, device);
      win.ActPopup.close();
    });
    row.append(text, open);
    rows.push(row);
  }
  $("sync-devices").replaceChildren(...rows);
}

function showUpdateState() {
  $("act-version").textContent = ActUpdater.currentVersion;
  $("update-status").textContent = ActUpdater.message;
  $("restart-update").hidden = ActUpdater.state != "ready";
  $("check-updates").disabled =
    !ActUpdater.supported || ["checking", "downloading", "ready"].includes(ActUpdater.state);
}

function copyCommand(command) {
  Cc["@mozilla.org/widget/clipboardhelper;1"]
    .getService(Ci.nsIClipboardHelper)
    .copyString(command);
  $("agent-status").textContent = "Copied. Paste it in a terminal.";
}

function agentCommand(cli) {
  let path = ActAgents.serverPath;
  return `${cli} mcp add act-browser -- node "${path}"`;
}

// --- Wiring --------------------------------------------------------------------

for (let id of ["open-now", "news"]) {
  $(id).addEventListener("click", () => {
    $(id).setAttribute("aria-pressed", String(!pressed(id)));
    if ($("query").value.trim()) {
      search();
    }
  });
}
$("city").addEventListener("keydown", e => {
  if (e.key == "Enter") {
    e.preventDefault();
    search();
  }
});
for (let chip of ideas.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    $("query").value = chip.textContent.trim();
    search(chip.textContent.trim());
  });
}

for (let card of ideas.querySelectorAll(".quick-card")) {
  card.addEventListener("click", () => {
    let title = card.querySelector(".quick-title")?.textContent || "";
    if (!title) {
      return;
    }
    $("query").value = title;
    search(title);
  });
}
$("see-all").addEventListener("click", () => {
  let query = $("query").value.trim();
  if (query) {
    win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(ActSearch.resultsUrl(query));
    win.ActPopup.close();
  }
});

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
for (let input of document.querySelectorAll("[data-pref]")) {
  input.addEventListener("change", () => {
    Services.prefs.setBoolPref(input.dataset.pref, input.checked);
  });
}
let accentInput = $("accent-color");
if (accentInput) {
  accentInput.addEventListener("change", () => {
    Services.prefs.setStringPref("act.accentColor", accentInput.value);
  });
}
$("sync-account").addEventListener("click", () => {
  ActTabSync.openAccountSettings(win);
  win.ActPopup.close();
});
$("check-updates").addEventListener("click", () => ActUpdater.check());
$("force-update").addEventListener("click", () => ActUpdater.forceCheck());
$("restart-update").addEventListener("click", () => ActUpdater.restartToUpdate());
let updateObserver = () => showUpdateState();
Services.obs.addObserver(updateObserver, ActUpdater.STATE_TOPIC);
window.addEventListener(
  "unload",
  () => Services.obs.removeObserver(updateObserver, ActUpdater.STATE_TOPIC),
  { once: true }
);
$("copy-claude").addEventListener("click", () => copyCommand(agentCommand("claude")));
$("copy-codex").addEventListener("click", () => copyCommand(agentCommand("codex")));
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
    "act.agents.enabled",
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
