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

function formatPrice(price, currency) {
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

function formatDate(iso) {
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

function siteCard(site, options) {
  let card = linkCard(site.url, "result site");
  let top = el("div", "result-top");
  let iconUrl = options.favicon?.(site.domain);
  if (iconUrl) {
    let icon = el("img", "favicon");
    icon.src = iconUrl;
    icon.alt = "";
    icon.addEventListener("error", () => icon.remove(), { once: true });
    top.append(icon);
  }
  top.append(el("span", "result-title", site.name));
  if (site.openNow === true) {
    top.append(el("span", "badge open", "Open"));
  } else if (site.openNow === false) {
    top.append(el("span", "badge closed", "Closed"));
  }
  card.append(top);

  let meta = [site.domain, site.category, site.city].filter(Boolean).join(" · ");
  card.append(el("div", "result-meta", meta));
  if (site.summary && site.summary != site.name) {
    card.append(el("p", "result-summary", site.summary));
  }

  let actions = site.actions.filter(a => a.id != "visit").slice(0, 5);
  if (actions.length) {
    let chips = el("div", "chips");
    for (let action of actions) {
      let chip = el("button", "chip", action.name);
      chip.title = action.description;
      chip.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        options.openLink(action.url || site.homeUrl || site.url);
      });
      chips.append(chip);
    }
    card.append(chips);
  }
  return card;
}

function productRow(product) {
  let row = linkCard(product.url, "result product");
  row.append(el("span", "result-title", product.name));
  row.append(el("span", "price", formatPrice(product.price, product.currency)));
  let meta = product.domain + (product.available ? "" : " · out of stock");
  row.append(el("div", "result-meta", meta));
  return row;
}

function eventRow(event) {
  let row = linkCard(event.url, "result event");
  row.append(el("span", "result-title", event.name));
  if (event.price != null) {
    row.append(el("span", "price", formatPrice(event.price, event.currency)));
  }
  let when = formatDate(event.start);
  let where = [event.venue, event.city].filter(Boolean).join(", ");
  row.append(el("div", "result-meta", [when, where].filter(Boolean).join(" · ")));
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
 * @param {Function} [options.favicon]  domain -> icon url, or nothing
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
    groups.push(group("Products", result.products.map(productRow)));
  }
  if (result.sites.length) {
    groups.push(group("Places & sites", result.sites.map(s => siteCard(s, options))));
  }
  if (result.related.length) {
    let chips = el("div", "chips");
    for (let related of result.related) {
      let chip = el("button", "chip", related);
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
