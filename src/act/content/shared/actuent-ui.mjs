/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Renders Actuent search results. Shared by the toolbar popup (a chrome
// page) and the new tab page (plain web content), so nothing in here may
// rely on privileges.
//
// Everything is built with createElement/textContent, never innerHTML: the
// text comes from the network.

export function el(tag, className, text) {
  let node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

export function formatPrice(price, currency) {
  if (price == null) {
    return "";
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

export function formatDate(iso) {
  let date = new Date(iso);
  if (isNaN(date)) {
    return "";
  }
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function linkCard(url, className) {
  let card = el(url ? "a" : "div", className);
  if (url) {
    card.href = url;
  }
  return card;
}

function hueOf(text) {
  let hash = 0;
  for (let char of text) {
    hash = (hash * 31 + char.codePointAt(0)) % 360;
  }
  return hash;
}

// The site's icon if the browser has one (options.icons, domain -> url),
// otherwise its first letter in a color of its own.
function siteIcon(domain, options) {
  let tile = el("span", "site-icon");
  let url = options.icons?.[domain];
  if (url) {
    let img = el("img");
    img.src = url;
    img.alt = "";
    tile.append(img);
  } else {
    tile.classList.add("lettered");
    tile.style.setProperty("--hue", hueOf(domain || "?"));
    tile.textContent = (domain || "?")[0].toUpperCase();
  }
  return tile;
}

function siteCard(site, options) {
  let card = linkCard(site.url, "result site");
  card.append(siteIcon(site.domain, options));

  let body = el("div", "result-body");
  let top = el("div", "result-top");
  top.append(el("span", "result-title", site.name));
  if (site.openNow === true) {
    top.append(el("span", "badge open", "Open"));
  } else if (site.openNow === false) {
    top.append(el("span", "badge closed", "Closed"));
  }
  body.append(top);

  let meta = [site.domain, site.category, site.city].filter(Boolean).join(" · ");
  body.append(el("div", "result-meta", meta));
  if (site.summary && site.summary != site.name) {
    body.append(el("p", "result-summary", site.summary));
  }

  let actions = site.actions.filter(a => a.id != "visit").slice(0, 3);
  if (actions.length) {
    let links = el("div", "result-actions");
    for (let action of actions) {
      let button = el("button", "result-action", action.name);
      button.type = "button";
      button.title = action.description;
      button.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        options.openLink(action.url || site.homeUrl || site.url);
      });
      links.append(button);
    }
    body.append(links);
  }
  card.append(body);
  return card;
}

function productRow(product, options) {
  let row = linkCard(product.url, "result product");
  row.append(siteIcon(product.domain, options));
  let body = el("div", "result-body");
  body.append(el("span", "result-title", product.name));
  let meta = product.domain + (product.available ? "" : " · out of stock");
  body.append(el("div", "result-meta", meta));
  row.append(body, el("span", "price", formatPrice(product.price, product.currency)));
  return row;
}

function eventRow(event) {
  let row = linkCard(event.url, "result event");
  let date = new Date(event.start);
  let cal = el("span", "event-date");
  if (!isNaN(date)) {
    cal.append(
      el("span", "event-month", date.toLocaleDateString(undefined, { month: "short" })),
      el("span", "event-day", String(date.getDate()))
    );
  }
  let body = el("div", "result-body");
  body.append(el("span", "result-title", event.name));
  let when = formatDate(event.start);
  let where = [event.venue, event.city].filter(Boolean).join(", ");
  body.append(el("div", "result-meta", [when, where].filter(Boolean).join(" · ")));
  row.append(cal, body);
  if (event.price != null) {
    row.append(el("span", "price", formatPrice(event.price, event.currency)));
  }
  return row;
}

function group(title, nodes) {
  let wrap = el("section", "result-group");
  wrap.append(el("h3", null, title), ...nodes);
  return wrap;
}

/**
 * Fills `container` with the result of Actuent.search().
 *
 * @param {Element} container
 * @param {object} result
 * @param {object} options
 * @param {Function} options.openLink   opens a url in a tab
 * @param {Function} options.onSearch   runs a new search (related queries)
 * @param {object} [options.icons]  domain -> icon url, for the ones the
 *   browser has
 * @returns {string} a status line for the caller to show, or ""
 */
export function renderResults(container, result, options) {
  let groups = [];

  if (result.answer?.sentences.length) {
    let box = el("div", "answer");
    for (let sentence of result.answer.sentences) {
      let p = el("p");
      p.append(sentence.text, " ");
      if (sentence.url) {
        let source = el("a", "source", "source");
        source.href = sentence.url;
        p.append(source);
      }
      box.append(p);
    }
    groups.push(group(`From ${result.answer.domain}`, [box]));
  }
  if (result.events.length) {
    groups.push(group("Events", result.events.map(eventRow)));
  }
  if (result.products.length) {
    groups.push(group("Products", result.products.map(p => productRow(p, options))));
  }
  if (result.sites.length) {
    groups.push(group("Places & sites", result.sites.map(s => siteCard(s, options))));
  }
  if (result.related.length) {
    let chips = el("div", "chips");
    for (let related of result.related) {
      let chip = el("button", "chip", related);
      chip.type = "button";
      chip.addEventListener("click", () => options.onSearch(related));
      chips.append(chip);
    }
    groups.push(group("Related", [chips]));
  }

  container.replaceChildren(...groups);

  if (!groups.length) {
    return result.didYouMean
      ? `Nothing found. Did you mean “${result.didYouMean}”?`
      : "Nothing found.";
  }
  return result.message || "";
}

/**
 * Makes every link inside `root` open in a browser tab instead of
 * navigating the page itself.
 */
export function handleLinks(root, openLink) {
  root.addEventListener("click", e => {
    let a = e.target.closest("a[href]");
    if (a) {
      e.preventDefault();
      openLink(a.href, { background: e.ctrlKey || e.metaKey || e.button == 1 });
    }
  });
}
