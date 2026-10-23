/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Weather from Rejn (https://rejn.app), a free weather app. The widget is a
// page Rejn hosts, shown in an iframe. Once its forecast has loaded it also
// posts the data to us, so the rest of the page can use it.
//
// Rejn's data is only shown together with the widget (which carries the
// Rejn credit), and never stored or sent anywhere else.

export const REJN_ORIGINS = ["https://rejn.app", "https://www.rejn.app"];
const REJN_EMBED = "https://rejn.app/embed";

// Below this height Rejn switches to its one-row layout.
export const ONE_ROW_MAX_HEIGHT = 229;
const MIN_WIDTH = 280;

/**
 * Builds the widget URL. Values go through URLSearchParams so they're
 * encoded properly.
 */
export function rejnEmbedUrl({ lat, lon, location, theme, lang, units, date, time } = {}) {
  let params = new URLSearchParams();
  if (lat != null && lon != null && lat !== "" && lon !== "") {
    params.set("lat", String(lat));
    params.set("lon", String(lon));
  }
  for (let [key, value] of Object.entries({ location, theme, lang, units, date, time })) {
    if (value != null && value !== "") {
      params.set(key, String(value));
    }
  }
  return `${REJN_EMBED}?${params}`;
}

/**
 * Creates the weather widget.
 *
 * @param {object} options
 * @param {number|string} [options.lat]
 * @param {number|string} [options.lon]  without lat/lon the widget asks for
 *   the visitor's location
 * @param {string} [options.location]  name to show
 * @param {"light"|"dark"} [options.theme]
 * @param {"en"|"da"} [options.lang]
 * @param {"metric"|"imperial"} [options.units]
 * @param {string} [options.date]  e.g. 2026-02-15
 * @param {string} [options.time]  e.g. 10:00
 * @param {number} [options.width]  at least 280
 * @param {number} [options.height]  under 230 gives the one-row layout
 * @param {Function} [options.onWeather]  called with Rejn's data, every time
 *   it arrives (it can come twice, use the latest)
 * @returns {{ element: HTMLIFrameElement, update: Function, requestData: Function, destroy: Function }}
 */
export function createRejnWeather(options = {}) {
  let current = { width: 320, height: 420, ...options };
  let iframe = document.createElement("iframe");
  iframe.className = "rejn-weather";
  iframe.title = "Weather forecast from Rejn";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin";
  iframe.style.cssText = "border:0;border-radius:16px;max-width:100%";

  function apply() {
    let hasPlace = current.lat != null && current.lon != null;
    // Without a fixed place Rejn needs the browser's location, and only
    // gets to ask for it when the iframe allows it.
    if (hasPlace) {
      iframe.removeAttribute("allow");
    } else {
      iframe.setAttribute("allow", "geolocation");
    }
    iframe.width = String(Math.max(MIN_WIDTH, current.width));
    iframe.height = String(current.height);
    let src = rejnEmbedUrl(current);
    if (iframe.src != src) {
      iframe.src = src;
    }
  }

  function onMessage(event) {
    // Only trust messages from Rejn, and only from our own iframe.
    if (!REJN_ORIGINS.includes(event.origin) || event.source != iframe.contentWindow) {
      return;
    }
    let data = event.data;
    if (data?.type != "rejn:weather" || data.version != 1) {
      return;
    }
    try {
      current.onWeather?.(data);
    } catch (e) {
      console.error("Weather callback failed", e);
    }
  }

  window.addEventListener("message", onMessage);
  apply();

  return {
    element: iframe,

    /** Change any of the options, the widget reloads if it has to. */
    update(changes) {
      current = { ...current, ...changes };
      apply();
    },

    /** Ask Rejn to send the data again (no-op until the widget has loaded). */
    requestData() {
      // rejn.app redirects to www.rejn.app, and a message addressed to the
      // wrong origin is dropped. Address both, only the right one arrives.
      for (let origin of REJN_ORIGINS) {
        iframe.contentWindow?.postMessage({ type: "rejn:get" }, origin);
      }
    },

    destroy() {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    },
  };
}
