/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Act new tab page: a search box that asks Actuent (or the default
// search engine) and the sites you visit most.

import {
  Actuent,
  browserWindow,
  el,
  handleLinks,
  renderResults,
} from "chrome://act/content/shared/actuent-ui.mjs";

const { NewTabUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/NewTabUtils.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

const $ = id => document.getElementById(id);
let searchAbort = null;

function win() {
  return browserWindow();
}


function openLink(url, { background = false } = {}) {
  if (background) {
    win().ActBrowser.openLink(url, { background: true });
    return;
  }
  // Navigate this tab, like a normal new tab page would.
  try {
    let { protocol } = new URL(url);
    if (protocol == "https:" || protocol == "http:") {
      win().openWebLinkIn(url, "current");
    }
  } catch {}
}

function greeting() {
  let hour = new Date().getHours();
  if (hour < 5) {
    return "Good night";
  }
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

async function webSearch(query) {
  query = query.trim();
  if (!query) {
    return;
  }
  let engine = await SearchService.getDefault();
  openLink(engine.getSubmission(query).uri.spec);
}

async function actuentSearch(query) {
  query = query.trim();
  $("query").value = query;
  if (!query) {
    clearResults();
    return;
  }
  document.body.classList.add("searching");
  $("credit").hidden = false;

  searchAbort?.abort();
  let abort = (searchAbort = new AbortController());
  $("status").textContent = "Searching…";
  try {
    let result = await Actuent.search(query, { limit: 10, signal: abort.signal });
    if (!abort.signal.aborted) {
      $("status").textContent = renderResults($("results"), result, {
        openLink,
        onSearch: actuentSearch,
      });
    }
  } catch (e) {
    if (e.name != "AbortError") {
      $("status").textContent = e.message;
    }
  }
}

function clearResults() {
  searchAbort?.abort();
  document.body.classList.remove("searching");
  $("results").replaceChildren();
  $("status").textContent = "";
  $("credit").hidden = true;
}

async function loadTopSites() {
  let sites = [];
  try {
    sites = await NewTabUtils.activityStreamLinks.getTopSites({
      numItems: 8,
      onePerDomain: true,
    });
  } catch (e) {
    console.warn("Act: couldn't load top sites", e);
  }
  let tiles = sites.slice(0, 8).map(site => {
    let link = el("a");
    link.href = site.url;
    let tile = el("div", "tile");
    let icon = el("img");
    icon.src = `page-icon:${site.url}`;
    icon.alt = "";
    tile.append(icon);
    let host = "";
    try {
      host = new URL(site.url).hostname.replace(/^www\./, "");
    } catch {}
    link.title = site.title || site.url;
    link.append(tile, el("span", null, site.title || host));
    return link;
  });
  $("top-sites").replaceChildren(...tiles);
}

async function updateEngineLabel() {
  let engine = await SearchService.getDefault();
  $("web-search").textContent = engine.name;
  $("web-search").title = `Search ${engine.name} (Shift+Enter)`;
}

function applyPrefs() {
  let actuent = Services.prefs.getBoolPref("act.actuent.enabled", true);
  $("actuent-search").hidden = !actuent;
  $("query").placeholder = actuent
    ? "Ask Actuent about places, prices, events… or search the web"
    : "Search the web";
  if (!actuent) {
    clearResults();
  }
}

$("greeting").textContent = greeting();

$("search").addEventListener("submit", e => {
  e.preventDefault();
  let query = $("query").value;
  if (Services.prefs.getBoolPref("act.actuent.enabled", true)) {
    actuentSearch(query);
  } else {
    webSearch(query);
  }
});
$("query").addEventListener("keydown", e => {
  if (e.key == "Enter" && e.shiftKey) {
    e.preventDefault();
    webSearch($("query").value);
  } else if (e.key == "Escape") {
    $("query").value = "";
    clearResults();
  }
});
$("query").addEventListener("input", () => {
  if (!$("query").value) {
    clearResults();
  }
});
$("web-search").addEventListener("click", () => webSearch($("query").value));
handleLinks(document, openLink);

let observer = () => applyPrefs();
Services.prefs.addObserver("act.actuent.enabled", observer);
window.addEventListener(
  "unload",
  () => Services.prefs.removeObserver("act.actuent.enabled", observer),
  { once: true }
);

applyPrefs();
updateEngineLabel();
loadTopSites();
$("query").focus();
