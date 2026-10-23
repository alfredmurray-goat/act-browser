/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Act new tab page: a search box that asks Actuent (live, as you type)
// or the default search engine, the sites you visit most, and the weather.
//
// This page runs as normal web content. Whatever it needs from the browser
// comes through window.ActNewTab (see modules/actors/ActNewTabChild).

import { el, handleLinks, renderResults } from "../shared/actuent-ui.mjs";
import { createRejnWeather } from "../shared/rejn-weather.mjs";

const $ = id => document.getElementById(id);
const api = window.ActNewTab;

const LIVE_DELAY_MS = 300;
const LIVE_MIN_CHARS = 3;

let state = null;
let searchTicket = 0;
let liveTimer = null;
let weather = null;

function isWebUrl(url) {
  try {
    let { protocol } = new URL(url);
    return protocol == "https:" || protocol == "http:";
  } catch {
    return false;
  }
}

function looksLikeUrl(text) {
  return !/\s/.test(text) && /^[^\s/]+\.[a-z]{2,}(\/|$)/i.test(text);
}

function openLink(url, { background = false } = {}) {
  if (!isWebUrl(url)) {
    return;
  }
  if (background) {
    api.openInBackground(url);
  } else {
    location.href = url;
  }
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

// --- Search ---------------------------------------------------------------------------

async function webSearch(query) {
  let url = await api.webSearchUrl(query);
  if (url) {
    location.href = url;
  }
}

async function actuentSearch(query, { live = false } = {}) {
  query = query.trim();
  if (!query) {
    clearResults();
    return;
  }
  let ticket = ++searchTicket;
  if (!live) {
    $("status").textContent = "Searching…";
  }
  let result;
  try {
    result = await api.search(query, { live });
  } catch (e) {
    if (ticket == searchTicket && !live) {
      $("status").textContent = e.message;
    }
    return;
  }
  // Only the newest search gets to draw, and only while the box still says
  // what we searched for.
  if (ticket != searchTicket || $("query").value.trim() != query || !result) {
    return;
  }
  document.body.classList.add("searching");
  $("credit").hidden = false;
  $("status").textContent = renderResults($("results"), result, {
    openLink,
    onSearch: related => {
      $("query").value = related;
      actuentSearch(related);
    },
  });
}

function clearResults() {
  searchTicket++;
  clearTimeout(liveTimer);
  document.body.classList.remove("searching");
  $("results").replaceChildren();
  $("status").textContent = "";
  $("credit").hidden = true;
}

function onInput() {
  clearTimeout(liveTimer);
  let query = $("query").value.trim();
  if (!query) {
    clearResults();
    return;
  }
  if (!state?.actuentEnabled || query.length < LIVE_MIN_CHARS || looksLikeUrl(query)) {
    return;
  }
  liveTimer = setTimeout(() => actuentSearch(query, { live: true }), LIVE_DELAY_MS);
}

// --- Top sites ----------------------------------------------------------------------

async function loadTopSites() {
  let sites = (await api.topSites().catch(() => null)) || [];
  let tiles = sites.map(site => {
    let link = el("a");
    link.href = site.url;
    link.title = site.title || site.url;
    let tile = el("div", "tile");
    let host = "";
    try {
      host = new URL(site.url).hostname.replace(/^www\./, "");
    } catch {}
    if (site.icon?.startsWith("data:")) {
      let icon = el("img");
      icon.src = site.icon;
      icon.alt = "";
      tile.append(icon);
    } else {
      tile.append(el("span", "letter", (host[0] || "?").toUpperCase()));
    }
    link.append(tile, el("span", "name", site.title || host));
    return link;
  });
  $("top-sites").replaceChildren(...tiles);
}

// --- Weather (Rejn) -----------------------------------------------------------------

function weatherTheme() {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function pageLocale() {
  return state?.locale || navigator.language || "en";
}

function weatherLang() {
  return /^da\b/i.test(pageLocale()) ? "da" : "en";
}

function weatherUnits(pref) {
  if (pref == "metric" || pref == "imperial") {
    return pref;
  }
  return /^en-(US|LR|MM)$/i.test(pageLocale()) ? "imperial" : "metric";
}

// A line under the greeting, from the data Rejn posts. The widget itself,
// with Rejn's credit, is on the same page.
function showWeatherLine(data, units) {
  let shown = data.shown || {};
  if (typeof shown.tempC != "number") {
    return;
  }
  let temp =
    units == "imperial"
      ? `${Math.round((shown.tempC * 9) / 5 + 32)}°F`
      : `${Math.round(shown.tempC)}°`;
  let parts = [temp];
  if (shown.conditionText) {
    parts.push(String(shown.conditionText).toLowerCase());
  }
  let place = data.place?.name;
  $("weather-line").textContent = place
    ? `${parts.join(", ")} in ${place}`
    : parts.join(", ");
  $("weather-line").hidden = false;
}

function setupWeather() {
  let options = state?.weather;
  let box = $("weather");
  if (!options) {
    weather?.destroy();
    weather = null;
    box.hidden = true;
    $("weather-line").hidden = true;
    return;
  }
  let units = weatherUnits(options.units);
  let props = {
    lat: options.lat || null,
    lon: options.lon || null,
    location: options.location || undefined,
    theme: weatherTheme(),
    lang: weatherLang(),
    units,
    // Under 230px tall Rejn switches to its one-row layout, which fits the
    // corner (it needs at least 280px of width).
    width: 300,
    height: 150,
    onWeather: data => showWeatherLine(data, units),
  };
  if (weather) {
    weather.update(props);
  } else {
    weather = createRejnWeather(props);
    box.append(weather.element);
  }
  box.hidden = false;
}

// --- State & wiring -----------------------------------------------------------------

async function loadState() {
  state = await api.state().catch(() => null);
  let actuent = !!state?.actuentEnabled;
  $("actuent-search").hidden = !actuent;
  $("query").placeholder = actuent
    ? "Ask Actuent about places, prices, events… or search the web"
    : "Search the web";
  $("web-search").textContent = state?.engineName || "Web";
  $("web-search").title = `Search ${state?.engineName || "the web"} (Shift+Enter)`;
  if (!actuent) {
    clearResults();
  }
  setupWeather();
}

if (api) {
  $("greeting").textContent = greeting();

  $("search").addEventListener("submit", e => {
    e.preventDefault();
    clearTimeout(liveTimer);
    let query = $("query").value;
    if (state?.actuentEnabled) {
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
  $("query").addEventListener("input", onInput);
  $("web-search").addEventListener("click", () => webSearch($("query").value));
  handleLinks(document, openLink);

  // Settings may have changed while this tab sat in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState == "visible") {
      loadState();
    }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
    weather?.update({ theme: weatherTheme() })
  );

  loadState();
  loadTopSites();
  // No autofocus here: a new tab focuses the address bar, and grabbing focus
  // back mid-typing is what made keystrokes jump between the two boxes.
}
