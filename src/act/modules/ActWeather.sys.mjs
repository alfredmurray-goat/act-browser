/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The latest weather the start page's Rejn widget showed, so the sidebar
// can show it too (act-corner.js), always with Rejn's credit and link.
// Kept in memory only: Rejn's data isn't stored or sent anywhere.

export const TOPIC = "act-weather-changed";

// An old forecast is worse than none.
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

const CONDITIONS = ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "snow", "storm"];

let latest = null;

function text(value, max = 80) {
  return typeof value == "string" ? value.slice(0, max) : "";
}

export const ActWeather = {
  get latest() {
    if (latest && Date.now() - latest.receivedAt > MAX_AGE_MS) {
      latest = null;
    }
    return latest;
  },

  /**
   * Takes the rejn:weather message the start page got. It comes from a web
   * content process, so only the few fields we show are copied, checked.
   */
  update(data) {
    let shown = data?.shown;
    if (typeof shown?.tempC != "number" || !Number.isFinite(shown.tempC)) {
      return;
    }
    let link = "";
    try {
      let url = new URL(text(data.link, 500));
      if (url.protocol == "https:" && /(^|\.)rejn\.app$/.test(url.hostname)) {
        link = url.href;
      }
    } catch {}
    latest = {
      tempC: shown.tempC,
      condition: CONDITIONS.includes(shown.condition) ? shown.condition : "",
      conditionText: text(shown.conditionText),
      place: text(data.place?.name),
      link: link || "https://rejn.app/",
      receivedAt: Date.now(),
    };
    Services.obs.notifyObservers(null, TOPIC);
  },
};
