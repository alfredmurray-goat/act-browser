/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Actuent in the address bar dropdown. There's always a "Search Actuent"
// row (it opens Actuent's results page, no request needed), and once you
// stop typing for a moment the matching sites show up under it: "coffee near
// the station", "notion pricing".

import {
  SkippableTimer,
  UrlbarProvider,
} from "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs";
import { ActPrefs } from "resource://act/ActPrefs.sys.mjs";
import { Actuent } from "resource://act/Actuent.sys.mjs";
import { ActSearch } from "resource://act/ActSearch.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ProvidersManager:
    "moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs",
  UrlbarResult: "chrome://browser/content/urlbar/UrlbarResult.mjs",
  UrlbarShared: "chrome://browser/content/urlbar/UrlbarShared.mjs",
});

// Wait for the user to stop typing before asking Actuent anything. The free
// tier allows 20 requests a minute: asking on every short pause used them
// up within a few searches, and then the results disappeared.
const DEBOUNCE_MS = 450;
const MIN_CHARS = 4;
// The "Search Actuent" row costs nothing, so it shows from the start.
const MIN_CHARS_ROW = 1;

function looksLikeUrl(text) {
  return (
    !/\s/.test(text) &&
    (/^[a-z][a-z0-9+.-]*:/i.test(text) || /^[^\s/]+\.[a-z]{2,}(\/|$)/i.test(text))
  );
}

class ActProviderActuent extends UrlbarProvider {
  // One AbortController per query. With a single shared one, cancelling the
  // previous query (which Firefox can do after the next one started) aborted
  // the request of the query the user was actually typing.
  #controllers = new WeakMap();

  get name() {
    return "ActProviderActuent";
  }

  get type() {
    return lazy.UrlbarShared.PROVIDER_TYPE.NETWORK;
  }

  async isActive(queryContext) {
    if (!ActPrefs.actuentEnabled || !ActPrefs.actuentUrlbar) {
      return false;
    }
    // Same rule as Firefox's own search suggestions: nothing typed in a
    // private window leaves the machine.
    if (queryContext.isPrivate || queryContext.searchMode) {
      return false;
    }
    let text = queryContext.trimmedSearchString;
    return (
      text.length >= MIN_CHARS_ROW &&
      !looksLikeUrl(text) &&
      !queryContext.restrictSource
    );
  }

  async startQuery(queryContext, addCallback) {
    let instance = this.queryInstance;
    let text = queryContext.trimmedSearchString;
    let { RESULT_TYPE, RESULT_SOURCE } = lazy.UrlbarShared;

    // With Actuent as the search engine the first row already is this.
    if (!ActSearch.isDefaultEngine()) {
      addCallback(
        this,
        new lazy.UrlbarResult({
          type: RESULT_TYPE.URL,
          source: RESULT_SOURCE.OTHER_NETWORK,
          suggestedIndex: 1,
          payload: {
            url: ActSearch.resultsUrl(text),
            title: `Search Actuent for “${text}”`,
            icon: "chrome://act/content/icons/logo-64.png",
          },
        })
      );
    }
    if (text.length < MIN_CHARS) {
      return;
    }

    await new SkippableTimer({
      name: "ActProviderActuent",
      time: DEBOUNCE_MS,
      logger: this.logger,
    }).promise;
    if (instance != this.queryInstance) {
      return;
    }

    let max = Math.max(1, Math.min(ActPrefs.actuentUrlbarMax, 6));
    let controller = new AbortController();
    this.#controllers.set(queryContext, controller);
    let result;
    try {
      result = await Actuent.search(queryContext.trimmedSearchString, {
        limit: max + 2,
        priority: "typing",
        signal: controller.signal,
      });
    } catch {
      // Offline, rate limited or cancelled. Either way, show nothing.
      return;
    } finally {
      this.#controllers.delete(queryContext);
    }
    if (instance != this.queryInstance) {
      return;
    }

    let index = 0;
    for (let site of result.sites.slice(0, max)) {
      if (!site.homeUrl) {
        continue;
      }
      let title = site.name;
      if (site.openNow === true) {
        title += " · open now";
      }
      if (site.summary && site.summary != site.name) {
        title += ` — ${site.summary}`;
      }
      addCallback(
        this,
        new lazy.UrlbarResult({
          type: RESULT_TYPE.URL,
          source: RESULT_SOURCE.OTHER_NETWORK,
          // Fixed slots right under the first row. Without them, a profile
          // with lots of history fills the list before these arrive and
          // Actuent never shows up.
          suggestedIndex: 2 + index++,
          payload: {
            url: site.homeUrl,
            title,
            icon: `page-icon:https://${site.domain}/`,
          },
        })
      );
    }
  }

  cancelQuery(queryContext) {
    this.#controllers.get(queryContext)?.abort();
    this.#controllers.delete(queryContext);
  }
}

let provider = null;

export const ActUrlbar = {
  register() {
    if (provider) {
      return;
    }
    provider = new ActProviderActuent();
    lazy.ProvidersManager.getInstanceForSap("urlbar").registerProvider(provider);
  },

  unregister() {
    if (!provider) {
      return;
    }
    lazy.ProvidersManager.getInstanceForSap("urlbar").unregisterProvider(
      provider
    );
    provider = null;
  },
};
