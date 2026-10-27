/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Act new tab page: one search box (your search engine, with Actuent's
// live results in its suggestions), the sites you visit most, and the
// weather.
//
// This page runs as normal web content. Whatever it needs from the browser
// comes through window.ActNewTab (see modules/actors/ActNewTabChild).

import { el, formatDate, formatPrice, handleLinks } from "../shared/actuent-ui.mjs";
import { createRejnWeather } from "../shared/rejn-weather.mjs";

const $ = id => document.getElementById(id);
const api = window.ActNewTab;

// Longer than a typing pause: Actuent's free tier allows 20 requests a
// minute, shared with the address bar.
const LIVE_DELAY_MS = 450;
const LIVE_MIN_CHARS = 3;

try { document.documentElement.setAttribute("act-theme", Services.prefs.getStringPref("act.theme", "dark")); } catch {}
let state = null;
let searchTicket = 0;
let liveTimer = null;
let weather = null;

// The dropdown: rows are { title, meta, side, sideClass, icon, url | run }.
let actuentRows = [];
let actuentStatus = ""; // "", "loading" or a message
let selected = 0;

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

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  search:
    "M7 1.75a5.25 5.25 0 0 1 4.16 8.46l3.07 3.07a.75.75 0 1 1-1.06 1.06l-3.07-3.07A5.25 5.25 0 1 1 7 1.75zm0 1.5a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5z",
  globe:
    "M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm2.4 7.75H5.6c.1 1.97.79 3.6 1.4 4.42.3.04.66.08 1 .08s.7-.04 1-.08c.61-.82 1.3-2.45 1.4-4.42zm-6.3 0H2.55a5.5 5.5 0 0 0 3.2 4.53 9.3 9.3 0 0 1-1.15-4.53zm9.35 0H11.9a9.3 9.3 0 0 1-1.15 4.53 5.5 5.5 0 0 0 2.7-4.53zM5.75 2.72a5.5 5.5 0 0 0-3.2 4.53H4.1c.1-1.8.53-3.35 1.15-4.53zM8 2.5c-.34 0-.7.04-1 .08-.61.82-1.3 2.45-1.4 4.42h4.8c-.1-1.97-.79-3.6-1.4-4.42-.3-.04-.66-.08-1-.08zm2.25.22c.62 1.18 1.06 2.73 1.15 4.53h1.55a5.5 5.5 0 0 0-2.7-4.53z",
};

function iconNode(name) {
  let svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  let path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}

async function webSearch(query) {
  let url = await api.webSearchUrl(query);
  if (url) {
    location.href = url;
  }
}

function toUrl(text) {
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

// Turns an Actuent result into dropdown rows: a direct answer first, then
// places and sites, events and products.
function actuentToRows(result) {
  let rows = [];
  let sentence = result.answer?.sentences?.[0];
  if (sentence?.text) {
    rows.push({
      title: sentence.text,
      meta: `From ${result.answer.domain}`,
      letter: "i",
      url: sentence.url,
    });
  }
  for (let site of (result.sites || []).slice(0, 5)) {
    let meta = [site.category, site.city].filter(Boolean).join(" · ") || site.domain;
    let row = {
      title: site.name,
      meta: site.summary && site.summary != site.name ? `${meta} — ${site.summary}` : meta,
      letter: (site.name || site.domain || "?")[0].toUpperCase(),
      url: site.url,
    };
    if (site.openNow === true) {
      row.side = "Open";
      row.sideClass = "open";
    } else if (site.openNow === false) {
      row.side = "Closed";
      row.sideClass = "closed";
    }
    rows.push(row);
  }
  for (let event of (result.events || []).slice(0, 3)) {
    rows.push({
      title: event.name,
      meta: [formatDate(event.start), event.venue].filter(Boolean).join(" · "),
      side: event.price != null ? formatPrice(event.price, event.currency) : "",
      letter: "★",
      url: event.url,
    });
  }
  for (let product of (result.products || []).slice(0, 3)) {
    rows.push({
      title: product.name,
      meta: product.domain,
      side: formatPrice(product.price, product.currency),
      letter: "$",
      url: product.url,
    });
  }
  return rows.filter(row => row.title && isWebUrl(row.url));
}


function currentRows() {
  let query = $("query").value.trim();
  if (!query) {
    return [];
  }
  let rows = [];
  if (looksLikeUrl(query)) {
    rows.push({ title: query, meta: "Go to site", icon: "globe", url: toUrl(query) });
  }
  rows.push({
    title: query,
    meta: `Search with ${state?.engineName || "the web"}`,
    icon: "search",
    run: () => webSearch(query),
  });
  // When Actuent has nothing to show yet (or was busy), offer its full
  // results page instead, so it's always one click away.
  let tryActuent = state?.actuentEnabled && !looksLikeUrl(query) && !actuentRows.length && actuentStatus != "loading";
  if (tryActuent) {
    return [
      ...rows,
      {
        title: "Try this search in Actuent?",
        meta: `Places, prices and events for “${query}”`,
        image: "../icons/actuent-64.png",
        url: `../search/search.html?q=${encodeURIComponent(query)}`,
        local: true,
      },
    ];
  }
  return [...rows, ...actuentRows];
}

function renderSuggestions() {
  let list = $("suggest");
  let rows = currentRows();
  let open = rows.length > 0 && document.activeElement == $("query");
  list.hidden = !open;
  $("search").classList.toggle("open", open);
  $("query").setAttribute("aria-expanded", open);
  if (!open) {
    return;
  }
  selected = Math.min(selected, rows.length - 1);

  let items = [];
  let actuentStart = rows.length - actuentRows.length;
  rows.forEach((row, i) => {
    if (i == actuentStart && actuentRows.length) {
      items.push(el("li", "suggest-heading", "Actuent"));
    }
    let li = el("li", "suggestion");
    li.id = `suggestion-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", i == selected);
    let icon = el("span", "icon");
    if (row.image) {
      let img = el("img");
      img.src = row.image;
      img.alt = "";
      icon.append(img);
    } else if (row.icon) {
      icon.append(iconNode(row.icon));
    } else {
      icon.textContent = row.letter || "•";
    }
    let text = el("span", "text");
    text.append(el("span", "title", row.title));
    if (row.meta) {
      text.append(el("span", "meta", row.meta));
    }
    li.append(icon, text);
    if (row.side) {
      li.append(el("span", `side ${row.sideClass || ""}`, row.side));
    }
    li.addEventListener("mousemove", () => {
      if (selected != i) {
        selected = i;
        renderSuggestions();
      }
    });
    li.addEventListener("click", e => activate(row, { background: e.ctrlKey || e.metaKey }));
    items.push(li);
  });

  if (actuentStatus == "loading" && !actuentRows.length) {
    items.push(el("li", "suggest-status", "Looking on Actuent…"));
  } else if (actuentStatus && actuentStatus != "loading") {
    items.push(el("li", "suggest-status", actuentStatus));
  }
  if (actuentRows.length) {
    let credit = el("li", "suggest-credit");
    let link = el("a", null, "Actuent");
    link.href = "https://actuent.ai";
    credit.append("Live results from ", link);
    items.push(credit);
  }
  list.replaceChildren(...items);
  $("query").setAttribute("aria-activedescendant", `suggestion-${selected}`);
}

function activate(row, { background = false } = {}) {
  if (row.run) {
    row.run();
  } else if (row.local) {
    location.href = row.url;
  } else if (row.url) {
    openLink(row.url, { background });
  }
}

async function fetchActuent(query) {
  let ticket = ++searchTicket;
  actuentStatus = "loading";
  renderSuggestions();
  let result = null;
  try {
    result = await api.search(query, { live: true });
  } catch {
    // Offline or rate limited: the web search row is still there.
    if (ticket == searchTicket) {
      actuentRows = [];
      actuentStatus = "";
      renderSuggestions();
    }
    return;
  }
  // Only the newest search may draw, and only while the box still says it.
  if (ticket != searchTicket || $("query").value.trim() != query) {
    return;
  }
  actuentRows = result ? actuentToRows(result) : [];
  actuentStatus = "";
  renderSuggestions();
}

function onInput() {
  clearTimeout(liveTimer);
  searchTicket++;
  actuentRows = [];
  actuentStatus = "";
  selected = 0;
  let query = $("query").value.trim();
  renderSuggestions();
  if (
    !query ||
    !state?.actuentEnabled ||
    query.length < LIVE_MIN_CHARS ||
    looksLikeUrl(query)
  ) {
    return;
  }
  liveTimer = setTimeout(() => fetchActuent(query), LIVE_DELAY_MS);
}

function onKeyDown(e) {
  let rows = currentRows();
  switch (e.key) {
    case "ArrowDown":
    case "ArrowUp":
      if (rows.length) {
        e.preventDefault();
        let step = e.key == "ArrowDown" ? 1 : -1;
        selected = (selected + step + rows.length) % rows.length;
        renderSuggestions();
      }
      break;
    case "Enter":
      e.preventDefault();
      if (rows[selected]) {
        activate(rows[selected], { background: e.ctrlKey || e.metaKey });
      }
      break;
    case "Escape":
      if ($("query").value) {
        $("query").value = "";
        onInput();
      } else {
        $("query").blur();
      }
      break;
  }
}

// --- Saved and frequent sites ---------------------------------------------------

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hueOf(text) {
  let hash = 0;
  for (let char of text) {
    hash = (hash * 31 + char.codePointAt(0)) % 360;
  }
  return hash;
}

// One tile. `action` is the small button in its corner: remove for saved
// sites, save for frequent ones.
function siteTile(site, action) {
  let link = el("a", "site");
  link.href = site.url;
  link.title = site.title || site.url;
  let tile = el("div", "tile");
  let host = hostOf(site.url);
  if (site.icon?.startsWith("data:")) {
    let icon = el("img");
    icon.src = site.icon;
    icon.alt = "";
    tile.append(icon);
  } else {
    // No icon saved for the site: its first letter, in a color of its own.
    let letter = el("span", "letter", (host.replace(/^www\./, "")[0] || "?").toUpperCase());
    tile.style.setProperty("--hue", hueOf(host));
    tile.classList.add("lettered");
    tile.append(letter);
  }
  link.append(tile, el("span", "name", site.title || host));

  if (action) {
    let button = el("button", `tile-action ${action.kind}`, action.kind == "remove" ? "×" : "+");
    button.type = "button";
    button.title = action.label;
    button.setAttribute("aria-label", action.label);
    button.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      action.run();
    });
    link.append(button);
  }
  return link;
}

let savedSites = [];

async function renderWidgets() {
  let container = $("widgets");
  if (!container) return;
  container.replaceChildren();
  // Clock widget
  let clock = document.createElement("div");
  clock.className = "widget clock-widget";
  let time = document.createElement("div");
  time.className = "widget-time";
  let date = document.createElement("div");
  date.className = "widget-date";
  clock.append(time, date);
  container.append(clock);
  function tick() {
    let now = new Date();
    time.textContent = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    date.textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  tick();
  setInterval(tick, 1000);

  // Notes widget
  let notes = document.createElement("div");
  notes.className = "widget notes-widget";
  let notesTitle = document.createElement("div");
  notesTitle.className = "widget-title";
  notesTitle.textContent = "Quick notes";
  let textarea = document.createElement("textarea");
  textarea.className = "widget-notes";
  textarea.placeholder = "Type a note...";
  try { textarea.value = localStorage.getItem("act-notes") || ""; } catch {}
  textarea.addEventListener("input", () => {
    try { localStorage.setItem("act-notes", textarea.value); } catch {}
  });
  notes.append(notesTitle, textarea);
  container.append(notes);
}

async function renderSites(saved) {
  savedSites = saved || (await api.savedSites().catch(() => [])) || [];
  let savedUrls = new Set(savedSites.map(s => s.url));

  let tiles = savedSites.map(site =>
    siteTile(site, {
      kind: "remove",
      label: `Remove ${site.title || hostOf(site.url)}`,
      run: async () => renderSites(await api.removeSite(site.url)),
    })
  );
  let add = el("button", "site add-site");
  add.type = "button";
  let plus = el("div", "tile");
  plus.append(el("span", "letter", "+"));
  add.append(plus, el("span", "name", "Add site"));
  add.addEventListener("click", () => {
    $("add-site").hidden = false;
    $("add-site-url").focus();
  });
  $("saved-sites").replaceChildren(...tiles, add);

  let frequent = ((await api.topSites().catch(() => null)) || [])
    .filter(site => !savedUrls.has(site.url))
    .slice(0, 8);
  $("top-sites").replaceChildren(
    ...frequent.map(site =>
      siteTile(site, {
        kind: "save",
        label: `Save ${site.title || hostOf(site.url)}`,
        run: async () => renderSites(await api.saveSite(site.url, site.title || "")),
      })
    )
  );
  $("top-sites-heading").hidden = !frequent.length;
}

async function addSite(e) {
  e.preventDefault();
  let url = $("add-site-url").value.trim();
  if (!url) {
    return;
  }
  let saved = await api.saveSite(url, $("add-site-name").value);
  $("add-site").reset();
  $("add-site").hidden = true;
  renderSites(saved);
}

// --- Weather (Rejn) -----------------------------------------------------------------

function weatherTheme() {
  return "dark";
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

function setupWeather() {
  let options = state?.weather;
  let box = $("weather");
  if (!options) {
    weather?.destroy();
    weather = null;
    box.hidden = true;
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
    // Rejn's own one-row size. Smaller clips the card.
    width: 340,
    height: 170,
    // The sidebar shows it too, with Rejn's credit (act-corner.js).
    onWeather: data => api.weatherShown(data).catch(() => {}),
  };
  if (weather) {
    weather.update(props);
  } else {
    weather = createRejnWeather(props);
    box.append(weather.element);
  }
  box.hidden = false;
}

// --- Wallpaper ----------------------------------------------------------------------

// The presets are CSS (html[data-wallpaper] in newtab.css).
const WALLPAPERS = [
  { id: "glow", name: "Glow" },
  { id: "aurora", name: "Aurora" },
  { id: "sunset", name: "Sunset" },
  { id: "ocean", name: "Ocean" },
  { id: "forest", name: "Forest" },
  { id: "graphite", name: "Graphite" },
];
const MAX_WALLPAPER_MB = 15;

let wallpaperUrl = null;

function applyWallpaper(wallpaper) {
  let id = wallpaper?.id || "glow";
  document.documentElement.dataset.wallpaper = id;
  if (wallpaperUrl) {
    URL.revokeObjectURL(wallpaperUrl);
    wallpaperUrl = null;
  }
  if (id == "custom" && wallpaper.image) {
    let blob = new Blob([wallpaper.image.bytes], { type: wallpaper.image.type });
    wallpaperUrl = URL.createObjectURL(blob);
    document.documentElement.style.setProperty("--wallpaper-image", `url("${wallpaperUrl}")`);
  } else {
    document.documentElement.style.removeProperty("--wallpaper-image");
  }
  for (let option of $("wallpapers").children) {
    option.setAttribute("aria-checked", String(option.dataset.id == id));
  }
}

async function chooseWallpaper(id, file) {
  let bytes = null;
  let type = "";
  if (file) {
    if (file.size > MAX_WALLPAPER_MB * 1024 * 1024) {
      alert(`That picture is too big, pick one under ${MAX_WALLPAPER_MB} MB.`);
      return;
    }
    bytes = new Uint8Array(await file.arrayBuffer());
    type = file.type;
  }
  applyWallpaper(await api.setWallpaper(id, bytes, type));
}

function buildWallpaperPicker() {
  let option = (id, name, extraClass = "") => {
    let button = el("button", `wallpaper ${extraClass}`.trim());
    button.type = "button";
    button.title = name;
    button.dataset.id = id;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", name);
    let swatch = el("span", "swatch");
    swatch.dataset.preview = id;
    button.append(swatch);
    return button;
  };
  let presets = WALLPAPERS.map(w => option(w.id, w.name));
  presets.forEach(b => b.addEventListener("click", () => chooseWallpaper(b.dataset.id)));
  let custom = option("custom", "Your own picture…", "custom");
  custom.addEventListener("click", () => $("wallpaper-file").click());
  $("wallpapers").replaceChildren(...presets, custom);

  $("wallpaper-file").addEventListener("change", e => {
    let file = e.target.files[0];
    e.target.value = "";
    if (file) {
      chooseWallpaper("custom", file);
    }
  });

  let panel = $("customize-panel");
  let button = $("customize-button");
  let setOpen = open => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("click", e => {
    if (!panel.hidden && !e.target.closest("#customize")) {
      setOpen(false);
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key == "Escape" && !panel.hidden) {
      setOpen(false);
      button.focus();
    }
  });
}

async function loadWallpaper() {
  applyWallpaper(await api.wallpaper().catch(() => null));
}

// --- State & wiring -----------------------------------------------------------------

async function loadState() {
  state = await api.state().catch(() => null);
  $("query").placeholder = state?.actuentEnabled
    ? `Search ${state.engineName || "the web"}, or find places, prices and events`
    : `Search ${state?.engineName || "the web"} or enter address`;
  setupWeather();
}

if (api) {
  $("greeting").textContent = greeting();

  $("search").addEventListener("submit", e => e.preventDefault());
  $("query").addEventListener("input", onInput);
  $("query").addEventListener("keydown", onKeyDown);
  $("query").addEventListener("focus", renderSuggestions);
  $("query").addEventListener("blur", renderSuggestions);
  // Clicking a suggestion mustn't blur the box (and close the list) first.
  $("suggest").addEventListener("mousedown", e => e.preventDefault());
  handleLinks(document, openLink);

  // Settings may have changed while this tab sat in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState == "visible") {
      loadState();
      loadWallpaper();
    }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
    weather?.update({ theme: weatherTheme() })
  );

  $("add-site").addEventListener("submit", addSite);
  $("add-site-cancel").addEventListener("click", () => {
    $("add-site").reset();
    $("add-site").hidden = true;
  });

  buildWallpaperPicker();
  loadWallpaper();
  loadState();
  try { renderWidgets(); } catch (e) { console.error('widgets', e); }
  renderSites();
  // No autofocus here: a new tab focuses the address bar, and grabbing focus
  // back mid-typing is what made keystrokes jump between the two boxes.
}
