/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Actuent's results page, for Actuent in the search engine picker (see
// modules/ActSearch.sys.mjs). Actuent answers with data, not a page: sites
// with what you can do on them, products with prices, events with dates,
// sometimes a short answer. This lays it out.
//
// Plain web content like the start page, the browser side is
// window.ActNewTab (modules/actors/ActNewTabChild).

import { el, formatDate, formatPrice } from "../shared/actuent-ui.mjs";

const $ = id => document.getElementById(id);
const api = window.ActNewTab;

let ticket = 0;

function isWebUrl(url) {
  try {
    let { protocol } = new URL(url);
    return protocol == "https:" || protocol == "http:";
  } catch {
    return false;
  }
}

function link(url, className, text) {
  let a = el("a", className, text);
  if (isWebUrl(url)) {
    a.href = url;
  }
  return a;
}

function hueOf(text) {
  let hash = 0;
  for (let char of text) {
    hash = (hash * 31 + char.codePointAt(0)) % 360;
  }
  return hash;
}

// A site's icon from your history, or its first letter.
function siteIcon(domain, icons) {
  let tile = el("span", "site-icon");
  let icon = icons[domain];
  if (icon) {
    let img = el("img");
    img.src = icon;
    img.alt = "";
    tile.append(img);
  } else {
    tile.style.setProperty("--hue", hueOf(domain || "?"));
    tile.classList.add("lettered");
    tile.textContent = (domain || "?")[0].toUpperCase();
  }
  return tile;
}

// --- Pieces -----------------------------------------------------------------------

function siteResult(site, icons) {
  let row = el("article", "site");
  row.append(siteIcon(site.domain, icons));

  let body = el("div", "site-body");
  let head = el("div", "site-head");
  let title = link(site.url || site.homeUrl, "site-title", site.name);
  head.append(title);
  if (site.openNow === true) {
    head.append(el("span", "badge open", "Open now"));
  } else if (site.openNow === false) {
    head.append(el("span", "badge closed", "Closed"));
  }
  body.append(head);

  let meta = [site.domain, site.category, site.city].filter(Boolean).join(" · ");
  body.append(el("div", "site-meta", meta));
  if (site.summary && site.summary != site.name) {
    body.append(el("p", "site-summary", site.summary));
  }

  let actions = site.actions.filter(a => a.id != "visit" && isWebUrl(a.url)).slice(0, 4);
  let pages = site.pages.filter(p => p.title && p.path != "/").slice(0, 3);
  if (actions.length || pages.length) {
    let more = el("div", "site-links");
    for (let action of actions) {
      let a = link(action.url, "site-action", action.name);
      a.title = action.description || "";
      more.append(a);
    }
    for (let page of pages) {
      let url = `https://${site.domain}${page.path.startsWith("/") ? "" : "/"}${page.path}`;
      let a = link(url, "site-page", page.title);
      a.title = page.content || "";
      more.append(a);
    }
    body.append(more);
  }
  row.append(body);
  return row;
}

function productCard(product, icons) {
  let card = link(product.url, "product");
  card.append(siteIcon(product.domain, icons));
  let text = el("span", "product-text");
  text.append(el("span", "product-name", product.name));
  let meta = product.domain + (product.available ? "" : " · out of stock");
  text.append(el("span", "product-meta", meta));
  card.append(text);
  if (product.price != null) {
    card.append(el("span", "price", formatPrice(product.price, product.currency)));
  }
  return card;
}

function eventCard(event) {
  let card = link(event.url, "event");
  let date = new Date(event.start);
  let cal = el("span", "event-date");
  if (!isNaN(date)) {
    cal.append(
      el("span", "event-month", date.toLocaleDateString(undefined, { month: "short" })),
      el("span", "event-day", String(date.getDate()))
    );
  }
  let text = el("span", "event-text");
  text.append(el("span", "event-name", event.name));
  let where = [event.venue, event.city].filter(Boolean).join(", ");
  text.append(el("span", "event-meta", [formatDate(event.start), where].filter(Boolean).join(" · ")));
  card.append(cal, text);
  if (event.price != null) {
    card.append(el("span", "price", formatPrice(event.price, event.currency)));
  }
  return card;
}

function section(title, children, className = "") {
  let wrap = el("section", `group ${className}`.trim());
  wrap.append(el("h2", null, title), ...children);
  return wrap;
}

function renderAnswer(answer) {
  let box = $("answer");
  if (!answer?.sentences.length) {
    box.hidden = true;
    return;
  }
  let text = el("p", "answer-text");
  answer.sentences.forEach((sentence, i) => {
    text.append(sentence.text, " ");
    if (isWebUrl(sentence.url)) {
      let source = link(sentence.url, "cite", String(i + 1));
      source.title = sentence.url;
      text.append(source, " ");
    }
  });
  box.replaceChildren(el("div", "answer-from", `From ${answer.domain}`), text);
  box.hidden = false;
}

function renderRelated(related, query) {
  let box = $("related");
  if (!related.length) {
    box.hidden = true;
    return;
  }
  let chips = related.map(text => {
    let chip = el("button", "pill", text);
    chip.type = "button";
    chip.addEventListener("click", () => search(text));
    return chip;
  });
  box.replaceChildren(el("h2", null, `Related to “${query}”`), el("div", "chips"));
  box.querySelector(".chips").append(...chips);
  box.hidden = false;
}

function skeleton() {
  return Array.from({ length: 4 }, () => {
    let row = el("div", "site skeleton");
    row.append(el("span", "site-icon"), el("div", "site-body"));
    return row;
  });
}

// --- Searching --------------------------------------------------------------------

function filters() {
  return {
    kind: document.querySelector(".pill[data-kind][aria-pressed='true']")?.dataset.kind || "web",
    openNow: $("open-now").getAttribute("aria-pressed") == "true",
    city: $("city").value.trim(),
  };
}

function syncUrl(query) {
  let params = new URLSearchParams({ q: query });
  let { kind, openNow, city } = filters();
  if (kind != "web") {
    params.set("kind", kind);
  }
  if (openNow) {
    params.set("open", "1");
  }
  if (city) {
    params.set("city", city);
  }
  history.replaceState(null, "", `?${params}`);
  document.title = query ? `${query} - Actuent` : "Actuent";
}

async function search(query) {
  query = query.trim();
  $("q").value = query;
  syncUrl(query);
  if (!query) {
    $("main").replaceChildren();
    $("side").replaceChildren();
    $("answer").hidden = $("related").hidden = true;
    $("status").textContent = "";
    $("q").focus();
    return;
  }

  let mine = ++ticket;
  $("status").textContent = "";
  $("main").replaceChildren(...skeleton());
  $("side").replaceChildren();
  $("answer").hidden = $("related").hidden = true;
  showElsewhere(query);

  let result;
  try {
    result = await api.search(query, filters());
  } catch (e) {
    if (mine == ticket) {
      $("main").replaceChildren();
      $("status").textContent = /rate|slow/i.test(String(e))
        ? "Actuent needs a short break (too many searches this minute). Try again in a moment."
        : "Actuent couldn't be reached. Check your connection and try again.";
    }
    return;
  }
  if (mine != ticket) {
    return;
  }
  if (!result) {
    $("main").replaceChildren();
    $("status").textContent = "Actuent is turned off.";
    return;
  }

  let domains = [...new Set([...result.sites, ...result.products].map(r => r.domain).filter(Boolean))];
  let icons = (await api.icons(domains).catch(() => null)) || {};
  if (mine != ticket) {
    return;
  }

  renderAnswer(result.answer);
  $("main").replaceChildren(...result.sites.map(site => siteResult(site, icons)));

  let side = [];
  if (result.products.length) {
    side.push(section("Products", result.products.map(p => productCard(p, icons))));
  }
  if (result.events.length) {
    side.push(section("Events", result.events.map(eventCard)));
  }
  $("side").replaceChildren(...side);
  $("columns").classList.toggle("has-side", side.length > 0);
  renderRelated(result.related, query);

  let nothing = !result.sites.length && !side.length && !result.answer;
  if (nothing) {
    $("status").replaceChildren(
      result.didYouMean ? "Nothing found. Did you mean " : "Nothing found for this one."
    );
    if (result.didYouMean) {
      let fix = el("button", "link-button", result.didYouMean);
      fix.type = "button";
      fix.addEventListener("click", () => search(result.didYouMean));
      $("status").append(fix, "?");
    }
  } else {
    $("status").textContent = result.message || "";
  }
}

async function showElsewhere(query) {
  let other = await api.otherEngine(query).catch(() => null);
  let a = $("elsewhere");
  if (other?.url && isWebUrl(other.url)) {
    a.href = other.url;
    a.textContent = `Search ${other.name} for “${query}” instead`;
    a.hidden = false;
  } else {
    a.hidden = true;
  }
}

// --- Wiring -----------------------------------------------------------------------

if (api) {
  let params = new URLSearchParams(location.search);
  if (params.get("kind") == "news") {
    for (let pill of document.querySelectorAll(".pill[data-kind]")) {
      pill.setAttribute("aria-pressed", String(pill.dataset.kind == "news"));
    }
  }
  $("open-now").setAttribute("aria-pressed", String(params.get("open") == "1"));
  $("city").value = params.get("city") || "";

  $("form").addEventListener("submit", e => {
    e.preventDefault();
    search($("q").value);
  });
  for (let pill of document.querySelectorAll(".pill[data-kind]")) {
    pill.addEventListener("click", () => {
      for (let other of document.querySelectorAll(".pill[data-kind]")) {
        other.setAttribute("aria-pressed", String(other == pill));
      }
      search($("q").value);
    });
  }
  $("open-now").addEventListener("click", e => {
    let on = e.currentTarget.getAttribute("aria-pressed") != "true";
    e.currentTarget.setAttribute("aria-pressed", String(on));
    search($("q").value);
  });
  $("city").addEventListener("change", () => search($("q").value));
  $("city").addEventListener("keydown", e => {
    if (e.key == "Enter") {
      e.preventDefault();
      search($("q").value);
    }
  });
  $("home").addEventListener("click", e => {
    e.preventDefault();
    search("");
  });

  search(params.get("q") || "");
}
