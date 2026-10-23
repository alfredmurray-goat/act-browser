/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser side of the new tab page API (see ActNewTabChild). Everything that
// comes in is treated as untrusted, the page runs in a web content process.

import { ActPrefs } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
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

async function faviconFor(url) {
  try {
    let favicon = await lazy.PlacesUtils.favicons.getFaviconForPage(
      Services.io.newURI(url)
    );
    return favicon?.dataURI?.spec || null;
  } catch {
    return null;
  }
}

const PAGE_URL = "resource://act-page/newtab/";

export class ActNewTabParent extends JSWindowActorParent {
  async receiveMessage({ name, data: args }) {
    // The actor is only registered for the new tab page, check anyway.
    if (!this.manager.documentURI?.spec.startsWith(PAGE_URL)) {
      return null;
    }
    args = Array.isArray(args) ? args : [];
    switch (name) {
      case "ActNewTab:state":
        return this.#state();
      case "ActNewTab:search":
        return this.#search(String(args[0] ?? ""), !!args[1]?.live);
      case "ActNewTab:topSites":
        return this.#topSites();
      case "ActNewTab:webSearchUrl":
        return this.#webSearchUrl(String(args[0] ?? ""));
      case "ActNewTab:openInBackground":
        return this.#openInBackground(String(args[0] ?? ""));
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

  async #search(query, live) {
    query = query.trim().slice(0, 300);
    if (!query || !ActPrefs.actuentEnabled) {
      return null;
    }
    // As-you-type searches give up before the rate limit, so pressing Enter
    // always gets through.
    return lazy.Actuent.search(query, {
      limit: 10,
      priority: live ? "typing" : "user",
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

  #openInBackground(url) {
    if (!isWebUrl(url)) {
      return false;
    }
    let win = this.browsingContext.topChromeWindow;
    win?.ActBrowser?.openLink(url, { background: true });
    return true;
  }
}
