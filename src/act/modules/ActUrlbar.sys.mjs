/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Actuent results in the address bar dropdown. Type "coffee near the
// station" or "notion pricing" and the matching sites show up next to your
// history and search suggestions.

import {
  SkippableTimer,
  UrlbarProvider,
} from "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs";
import { ActPrefs } from "resource://act/ActPrefs.sys.mjs";
import { Actuent } from "resource://act/Actuent.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ProvidersManager:
    "moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs",
  UrlbarResult: "chrome://browser/content/urlbar/UrlbarResult.mjs",
  UrlbarShared: "chrome://browser/content/urlbar/UrlbarShared.mjs",
});

// Wait for the user to stop typing before asking Actuent anything.
const DEBOUNCE_MS = 200;
const MIN_CHARS = 4;

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
      text.length >= MIN_CHARS &&
      !looksLikeUrl(text) &&
      !queryContext.restrictSource
    );
  }

  async startQuery(queryContext, addCallback) {
    let instance = this.queryInstance;
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

    let { RESULT_TYPE, RESULT_SOURCE } = lazy.UrlbarShared;
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
          suggestedIndex: 1 + index++,
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
