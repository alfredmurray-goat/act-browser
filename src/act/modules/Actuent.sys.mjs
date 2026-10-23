/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Small client for the Actuent search API (https://docs.actuent.ai).
//
// Actuent turns websites into structured JSON ("LAWP"): what a site is, its
// pages, and the actions you can take on it (book, view pricing, ...). It
// also knows about places, products with prices and upcoming events.
//
// The free tier needs no key but is limited to 20 requests a minute, so we
// cache aggressively and let background callers (the urlbar) back off early.

import { ActPrefs } from "resource://act/ActPrefs.sys.mjs";
import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";

const RATE_WINDOW_MS = 60 * 1000;
// Requests per minute each kind of caller may use (the free tier allows 20).
// Lower priorities stop earlier, so there's always room for what the user
// is actively doing.
const LIMITS = {
  // An explicit search: pressing Enter, the Explore popup.
  user: 20,
  // Suggestions while typing, in the address bar and on the new tab page.
  typing: 17,
  // Site lookups for the ⚡ button.
  background: 10,
};

const SEARCH_TTL_MS = 5 * 60 * 1000;
const SITE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE = 200;

export class ActuentError extends Error {
  constructor(message, { status = 0, retryAfter = 0 } = {}) {
    super(message);
    this.name = "ActuentError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

class TTLCache {
  constructor(ttl) {
    this.ttl = ttl;
    this.map = new Map();
  }

  get(key) {
    let entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.time > this.ttl) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (this.map.size >= MAX_CACHE) {
      // Maps iterate in insertion order, so this drops the oldest entry.
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { value, time: Date.now() });
  }

  clear() {
    this.map.clear();
  }
}

const searchCache = new TTLCache(SEARCH_TTL_MS);
const siteCache = new TTLCache(SITE_TTL_MS);
const sitePending = new Map();
let requestTimes = [];
let blockedUntil = 0;

function canSend(priority) {
  let now = Date.now();
  if (now < blockedUntil) {
    return false;
  }
  requestTimes = requestTimes.filter(t => now - t < RATE_WINDOW_MS);
  return requestTimes.length < (LIMITS[priority] ?? LIMITS.background);
}

export function normalizeDomain(host) {
  return String(host || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

function isPublicHost(host) {
  if (!host || !host.includes(".")) {
    return false;
  }
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    return false; // IP addresses
  }
  return !/(^|\.)(localhost|local|test|internal|lan|home\.arpa)$/.test(host);
}

function safeUrl(url) {
  try {
    let uri = new URL(url);
    return uri.protocol == "https:" || uri.protocol == "http:" ? uri.href : "";
  } catch {
    return "";
  }
}

function toText(value, max = 400) {
  if (typeof value != "string") {
    return "";
  }
  value = value.replace(/\s+/g, " ").trim();
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }
  return actions
    .filter(a => a && typeof a == "object" && a.id)
    .map(a => ({
      id: String(a.id),
      name: toText(a.name, 80) || String(a.id),
      description: toText(a.description, 200),
      url: safeUrl(a.url),
      needsInput: !!a.input?.required,
    }));
}

/**
 * Turns one raw LAWP result into the shape the UI uses. Everything coming
 * back from the network is treated as untrusted text.
 */
export function normalizeSite(raw) {
  if (!raw || typeof raw != "object") {
    return null;
  }
  let pages = raw.pages && typeof raw.pages == "object" ? raw.pages : {};
  let home = pages["/"] || Object.values(pages)[0] || {};
  let business = raw.business || {};
  let address = business.address || {};

  return {
    domain: normalizeDomain(raw.domain),
    name: toText(raw.name, 120) || normalizeDomain(raw.domain),
    summary: toText(raw.snippet || home.content, 300),
    url:
      safeUrl(raw.visit_url) ||
      (raw.domain ? safeUrl(`https://${raw.domain}`) : ""),
    // The site itself, for places where Actuent's tracking link would look
    // odd (the address bar shows the URL).
    homeUrl: raw.domain ? safeUrl(`https://${normalizeDomain(raw.domain)}/`) : "",
    category: toText(raw.category || business.type, 40),
    city: toText(address.city, 60),
    openNow: typeof raw.open_now == "boolean" ? raw.open_now : null,
    native: !!raw.native,
    freshness: toText(raw.freshness, 160),
    pages: Object.entries(pages)
      .slice(0, 12)
      .map(([path, page]) => ({
        path,
        title: toText(page?.title, 100),
        content: toText(page?.content, 240),
      })),
    actions: normalizeActions(raw.actions),
  };
}

function normalizeProduct(p) {
  return {
    name: toText(p.name, 140),
    price: typeof p.price == "number" ? p.price : null,
    currency: toText(p.currency, 8),
    domain: normalizeDomain(p.domain),
    available: p.available !== false,
    url: safeUrl(p.visit_url || p.url),
  };
}

function normalizeEvent(e) {
  return {
    name: toText(e.name, 140),
    start: toText(e.start_date, 40),
    venue: toText(e.venue, 100),
    city: toText(e.city, 60),
    price: typeof e.price == "number" ? e.price : null,
    currency: toText(e.currency, 8),
    url: safeUrl(e.visit_url || e.url),
  };
}

function normalizeAnswer(a) {
  if (!a || !Array.isArray(a.sentences)) {
    return null;
  }
  return {
    domain: normalizeDomain(a.domain),
    sentences: a.sentences.slice(0, 5).map(s => ({
      text: toText(s.text, 400),
      url: safeUrl(s.url),
    })),
  };
}

export const Actuent = {
  get enabled() {
    return ActPrefs.actuentEnabled;
  },

  async _post(path, body, { signal, priority = "user" } = {}) {
    if (!this.enabled) {
      throw new ActuentError("Actuent is turned off");
    }
    if (!canSend(priority)) {
      throw new ActuentError("Slow down a little, Actuent is rate limited", {
        status: 429,
      });
    }
    requestTimes.push(Date.now());

    let endpoint = ActPrefs.actuentEndpoint.replace(/\/+$/, "");
    let response = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
      credentials: "omit",
    });

    if (response.status == 429) {
      let retryAfter = parseInt(response.headers.get("retry-after")) || 30;
      blockedUntil = Date.now() + retryAfter * 1000;
      throw new ActuentError("Actuent rate limit reached", {
        status: 429,
        retryAfter,
      });
    }
    if (!response.ok) {
      throw new ActuentError(`Actuent returned ${response.status}`, {
        status: response.status,
      });
    }
    return response.json();
  },

  /**
   * Search Actuent. Returns { sites, products, events, answer, related,
   * message, didYouMean }.
   *
   * @param {string} query
   * @param {object} [options]
   * @param {string} [options.city]
   * @param {boolean} [options.openNow]
   * @param {string} [options.kind] "web" or "news"
   * @param {number} [options.limit]
   * @param {AbortSignal} [options.signal]
   * @param {"user"|"typing"|"background"} [options.priority] lower priorities
   *   give up earlier near the rate limit
   */
  async search(query, options = {}) {
    query = String(query || "").trim();
    if (!query) {
      return { sites: [], products: [], events: [], related: [] };
    }

    let body = { query, limit: options.limit ?? 8 };
    if (options.city) {
      body.city = options.city;
    }
    if (options.openNow) {
      body.open_now = true;
    }
    if (options.kind && options.kind != "web") {
      body.kind = options.kind;
      if (options.kind == "news") {
        body.topic = query;
      }
    }

    let key = JSON.stringify(body);
    let cached = searchCache.get(key);
    if (cached) {
      return cached;
    }

    let data = await this._post("/api/search", body, options);
    let result = {
      query,
      sites: (data.results || []).map(normalizeSite).filter(Boolean),
      products: (data.products || []).slice(0, 12).map(normalizeProduct),
      events: (data.events || []).slice(0, 12).map(normalizeEvent),
      answer: normalizeAnswer(data.answer),
      related: (data.related || [])
        .map(r => toText(typeof r == "string" ? r : r?.query, 80))
        .filter(Boolean)
        .slice(0, 6),
      message: toText(data.message, 300),
      didYouMean: toText(data.did_you_mean, 120),
    };
    searchCache.set(key, result);
    return result;
  },

  /**
   * What can you do on this site? Tries the site's own
   * /.well-known/lawp.json first, then falls back to Actuent's index.
   * Resolves to a normalized site or null.
   */
  async lookupSite(host, { signal } = {}) {
    let domain = normalizeDomain(host);
    if (!this.enabled || !isPublicHost(domain)) {
      return null;
    }

    let cached = siteCache.get(domain);
    if (cached !== undefined) {
      return cached;
    }
    if (sitePending.has(domain)) {
      return sitePending.get(domain);
    }

    let promise = (async () => {
      let site = await this._fetchNativeLawp(domain, signal).catch(() => null);
      if (!site) {
        try {
          let result = await this.search(domain, {
            limit: 3,
            signal,
            priority: "background",
          });
          site = result.sites.find(s => s.domain == domain) || null;
        } catch (e) {
          // Don't cache network trouble or rate limiting, only real misses.
          if (e.name == "AbortError" || e.status == 429 || !e.status) {
            throw e;
          }
        }
      }
      siteCache.set(domain, site);
      return site;
    })();

    sitePending.set(domain, promise);
    try {
      return await promise;
    } catch {
      return null;
    } finally {
      sitePending.delete(domain);
    }
  },

  async _fetchNativeLawp(domain, signal) {
    let controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), 3000);
    signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      let response = await fetch(`https://${domain}/.well-known/lawp.json`, {
        signal: controller.signal,
        credentials: "omit",
        redirect: "follow",
      });
      let type = response.headers.get("content-type") || "";
      if (!response.ok || !type.includes("json")) {
        return null;
      }
      let raw = await response.json();
      if (!raw || !Array.isArray(raw.actions) || typeof raw.pages != "object") {
        return null;
      }
      let site = normalizeSite({ ...raw, domain: raw.domain || domain });
      site.native = true;
      return site;
    } finally {
      clearTimeout(timer);
    }
  },

  clearCaches() {
    searchCache.clear();
    siteCache.clear();
  },
};
