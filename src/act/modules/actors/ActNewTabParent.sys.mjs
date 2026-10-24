/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser side of the new tab page API (see ActNewTabChild). Everything that
// comes in is treated as untrusted, the page runs in a web content process.

import { ActPrefs } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ActWeather: "resource://act/ActWeather.sys.mjs",
  Actuent: "resource://act/Actuent.sys.mjs",
  NewTabUtils: "resource://gre/modules/NewTabUtils.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

function isWebUrl(url) {
  try {
    let { protocol } = new URL(url);
    return protocol == "https:" || protocol == "http:";
  } catch {
    return false;
  }
}

// The page's own icon, or else the one of the site's home page: Places
// often only has an icon for one of them.
async function faviconFor(url) {
  let candidates = [url];
  try {
    candidates.push(new URL(url).origin + "/");
  } catch {}
  for (let candidate of candidates) {
    try {
      let favicon = await lazy.PlacesUtils.favicons.getFaviconForPage(
        Services.io.newURI(candidate)
      );
      if (favicon?.dataURI?.spec) {
        return favicon.dataURI.spec;
      }
    } catch {}
  }
  return null;
}

// The start page, and Actuent's results page which uses search and icons.
const PAGE_URLS = ["resource://act-page/newtab/", "resource://act-page/search/"];
const SAVED_PREF = "act.newtab.savedSites";
const MAX_SAVED = 24;

const WALLPAPER_PREF = "act.newtab.wallpaper";
const WALLPAPER_TYPE_PREF = "act.newtab.wallpaperType";
// Must match the presets in newtab.css.
const WALLPAPERS = ["glow", "aurora", "sunset", "ocean", "forest", "graphite", "custom"];
const WALLPAPER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_WALLPAPER_BYTES = 15 * 1024 * 1024;

function wallpaperFile() {
  return PathUtils.join(PathUtils.profileDir, "act-wallpaper");
}

export class ActNewTabParent extends JSWindowActorParent {
  async receiveMessage({ name, data: args }) {
    // The actor is only registered for the new tab page, check anyway.
    let page = this.manager.documentURI?.spec || "";
    if (!PAGE_URLS.some(url => page.startsWith(url))) {
      return null;
    }
    args = Array.isArray(args) ? args : [];
    switch (name) {
      case "ActNewTab:state":
        return this.#state();
      case "ActNewTab:search":
        return this.#search(String(args[0] ?? ""), args[1] || {});
      case "ActNewTab:topSites":
        return this.#topSites();
      case "ActNewTab:webSearchUrl":
        return this.#webSearchUrl(String(args[0] ?? ""));
      case "ActNewTab:openInBackground":
        return this.#openInBackground(String(args[0] ?? ""));
      case "ActNewTab:savedSites":
        return this.#withIcons(this.#savedSites());
      case "ActNewTab:saveSite":
        return this.#saveSite(String(args[0] ?? ""), String(args[1] ?? ""));
      case "ActNewTab:removeSite":
        return this.#removeSite(String(args[0] ?? ""));
      case "ActNewTab:otherEngine":
        return this.#otherEngine(String(args[0] ?? ""));
      case "ActNewTab:icons":
        return this.#icons(Array.isArray(args[0]) ? args[0] : []);
      case "ActNewTab:weatherShown":
        lazy.ActWeather.update(args[0]);
        return null;
      case "ActNewTab:wallpaper":
        return this.#wallpaper();
      case "ActNewTab:setWallpaper":
        return this.#setWallpaper(String(args[0] ?? ""), args[1], String(args[2] ?? ""));
    }
    return null;
  }

  async #state() {
    let engine = await lazy.SearchService.getDefault();
    let weatherOn = Services.prefs.getBoolPref("act.weather.enabled", true);
    let useMyLocation = Services.prefs.getBoolPref("act.weather.useMyLocation", false);
    return {
      actuentEnabled: ActPrefs.actuentEnabled,
      engineName: engine?.name || "the web",
      locale: Services.locale.appLocaleAsBCP47,
      weather: weatherOn
        ? {
            lat: useMyLocation ? null : Services.prefs.getStringPref("act.weather.lat", ""),
            lon: useMyLocation ? null : Services.prefs.getStringPref("act.weather.lon", ""),
            location: useMyLocation
              ? ""
              : Services.prefs.getStringPref("act.weather.location", ""),
            units: Services.prefs.getStringPref("act.weather.units", ""),
          }
        : null,
    };
  }

  // Options come from the page: live (as you type), and the results
  // page's filters (news, open now, city).
  async #search(query, options) {
    query = query.trim().slice(0, 300);
    if (!query || !ActPrefs.actuentEnabled) {
      return null;
    }
    // As-you-type searches give up before the rate limit, so pressing Enter
    // always gets through.
    return lazy.Actuent.search(query, {
      limit: options.live ? 10 : 20,
      priority: options.live ? "typing" : "user",
      kind: options.kind == "news" ? "news" : "web",
      openNow: options.openNow === true,
      city: typeof options.city == "string" ? options.city.trim().slice(0, 80) : "",
    });
  }

  async #topSites() {
    let sites = [];
    try {
      sites = await lazy.NewTabUtils.activityStreamLinks.getTopSites({
        numItems: 8,
        onePerDomain: true,
      });
    } catch (e) {
      console.warn("Act: couldn't load top sites", e);
    }
    sites = sites.filter(s => isWebUrl(s.url)).slice(0, 8);
    return Promise.all(
      sites.map(async site => ({
        url: site.url,
        title: site.title || "",
        icon: await faviconFor(site.url),
      }))
    );
  }

  async #webSearchUrl(query) {
    query = query.trim().slice(0, 2000);
    if (!query) {
      return null;
    }
    let engine = await lazy.SearchService.getDefault();
    return engine.getSubmission(query).uri.spec;
  }

  // Saved sites on the start page, kept in a pref so they survive updates
  // and come along with the profile.
  #savedSites() {
    try {
      let list = JSON.parse(Services.prefs.getStringPref(SAVED_PREF, "[]"));
      return Array.isArray(list)
        ? list.filter(site => isWebUrl(site?.url)).slice(0, MAX_SAVED)
        : [];
    } catch {
      return [];
    }
  }

  async #saveSite(url, title) {
    try {
      url = new URL(/^[a-z]+:/i.test(url) ? url : `https://${url}`).href;
    } catch {
      return this.#savedSites();
    }
    if (!isWebUrl(url)) {
      return this.#savedSites();
    }
    let list = this.#savedSites().filter(site => site.url != url);
    list.push({ url, title: title.trim().slice(0, 60) || new URL(url).hostname.replace(/^www\./, "") });
    Services.prefs.setStringPref(SAVED_PREF, JSON.stringify(list.slice(-MAX_SAVED)));
    return this.#withIcons(this.#savedSites());
  }

  async #removeSite(url) {
    let list = this.#savedSites().filter(site => site.url != url);
    Services.prefs.setStringPref(SAVED_PREF, JSON.stringify(list));
    return this.#withIcons(list);
  }

  #withIcons(sites) {
    return Promise.all(sites.map(async site => ({ ...site, icon: await faviconFor(site.url) })));
  }

  #openInBackground(url) {
    if (!isWebUrl(url)) {
      return false;
    }
    let win = this.browsingContext.topChromeWindow;
    win?.ActBrowser?.openLink(url, { background: true });
    return true;
  }

  // The start page wallpaper: a preset name, or "custom" with the picture
  // the user chose, which is kept as a file in the profile.
  async #wallpaper() {
    let id = Services.prefs.getStringPref(WALLPAPER_PREF, "glow");
    if (!WALLPAPERS.includes(id)) {
      id = "glow";
    }
    if (id != "custom") {
      return { id };
    }
    try {
      let bytes = await IOUtils.read(wallpaperFile());
      let type = Services.prefs.getStringPref(WALLPAPER_TYPE_PREF, "image/jpeg");
      return { id, image: { bytes, type } };
    } catch {
      // The file is gone, fall back to the default.
      return { id: "glow" };
    }
  }

  async #setWallpaper(id, bytes, type) {
    if (!WALLPAPERS.includes(id)) {
      return this.#wallpaper();
    }
    if (id == "custom") {
      if (
        !(bytes instanceof Uint8Array) ||
        !bytes.length ||
        bytes.length > MAX_WALLPAPER_BYTES ||
        !WALLPAPER_TYPES.includes(type)
      ) {
        return this.#wallpaper();
      }
      await IOUtils.write(wallpaperFile(), bytes);
      Services.prefs.setStringPref(WALLPAPER_TYPE_PREF, type);
    } else {
      await IOUtils.remove(wallpaperFile(), { ignoreAbsent: true });
    }
    Services.prefs.setStringPref(WALLPAPER_PREF, id);
    return this.#wallpaper();
  }

  // Icons from Places for result domains, { domain: data URL } for the
  // ones we have. Nothing is fetched from the sites.
  async #icons(domains) {
    let icons = {};
    for (let domain of domains.slice(0, 30)) {
      domain = String(domain).toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
        continue;
      }
      let icon =
        (await faviconFor(`https://${domain}/`)) || (await faviconFor(`https://www.${domain}/`));
      if (icon) {
        icons[domain] = icon;
      }
    }
    return icons;
  }

  // For "search with Google instead" on Actuent's results page: the
  // default engine, or the first other one when Actuent is the default.
  async #otherEngine(query) {
    query = query.trim().slice(0, 2000);
    let engine = await lazy.SearchService.getDefault();
    if (engine?.name == "Actuent") {
      engine = (await lazy.SearchService.getVisibleEngines()).find(e => e.name != "Actuent");
    }
    if (!engine || !query) {
      return null;
    }
    return { name: engine.name, url: engine.getSubmission(query).uri.spec };
  }
}
