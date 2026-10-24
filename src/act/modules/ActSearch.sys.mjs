/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Actuent as a search engine, next to Google and the rest in the engine
// picker. Actuent answers with data rather than a results page, so the
// results page is ours: resource://act-page/search/.
//
// Firefox only takes http(s) addresses for search engines, so the engine
// points at search.actuent.invalid (a name that can never exist), and we
// send those loads to our page before they reach the network.

import { ActPrefs, PREF, watchPrefs } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

export const ENGINE_NAME = "Actuent";
const ENGINE_HOST = "search.actuent.invalid";
const ENGINE_URL = `https://${ENGINE_HOST}/?q={searchTerms}`;
export const RESULTS_URL = "resource://act-page/search/search.html";
const ENABLED_PREF = "act.actuent.searchEngine";

function enabled() {
  return ActPrefs.actuentEnabled && Services.prefs.getBoolPref(ENABLED_PREF, true);
}

const observer = {
  observe(subject) {
    let channel;
    try {
      channel = subject.QueryInterface(Ci.nsIHttpChannel);
    } catch {
      return;
    }
    if (channel.URI.host != ENGINE_HOST) {
      return;
    }
    let query = new URL(channel.URI.spec).searchParams.get("q") || "";
    channel.cancel(Cr.NS_BINDING_ABORTED);
    if (channel.loadInfo.externalContentPolicyType != Ci.nsIContentPolicy.TYPE_DOCUMENT) {
      return;
    }
    let browser = channel.loadInfo.browsingContext?.top?.embedderElement;
    Services.tm.dispatchToMainThread(() => {
      browser?.fixupAndLoadURIString(ActSearch.resultsUrl(query), {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    });
  },
};

export const ActSearch = {
  _started: false,

  init() {
    if (this._started) {
      return;
    }
    this._started = true;
    Services.obs.addObserver(observer, "http-on-modify-request");
    this._sync().catch(e => console.error("Act: Actuent search engine", e));
    watchPrefs([PREF.actuentEnabled, ENABLED_PREF], () =>
      this._sync().catch(e => console.error("Act: Actuent search engine", e))
    );
  },

  resultsUrl(query) {
    return `${RESULTS_URL}?q=${encodeURIComponent(query)}`;
  },

  isDefaultEngine() {
    try {
      return lazy.SearchService.defaultEngine?.name == ENGINE_NAME;
    } catch {
      return false;
    }
  },

  // Adds the engine, or removes it when Actuent (or this) is turned off.
  async _sync() {
    await lazy.SearchService.init();
    let engine = lazy.SearchService.getEngineByName(ENGINE_NAME);
    if (enabled() && !engine) {
      await lazy.SearchService.addUserEngine({
        name: ENGINE_NAME,
        url: ENGINE_URL,
        alias: "@actuent",
      });
    } else if (!enabled() && engine) {
      await lazy.SearchService.removeEngine(engine);
    }
  },
};
