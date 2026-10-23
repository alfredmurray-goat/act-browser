/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const PREF = {
  actuentEnabled: "act.actuent.enabled",
  actuentEndpoint: "act.actuent.endpoint",
  actuentUrlbar: "act.actuent.urlbar",
  actuentUrlbarMax: "act.actuent.urlbar.maxResults",
  actuentSiteActions: "act.actuent.siteActions",
  compactMode: "act.compactMode",
  sidebarToolbar: "act.layout.sidebarToolbar",
  extensionsInSidebar: "act.extensions.inSidebar",
  newtabEnabled: "act.newtab.enabled",
  agentsEnabled: "act.agents.enabled",
  agentsPort: "act.agents.port",
  framingAllowAll: "act.framing.allowAll",
  updateEnabled: "act.update.enabled",
  updateLastCheck: "act.update.lastCheck",
  updateIntervalHours: "act.update.intervalHours",
  workspacesEnabled: "act.workspaces.enabled",
  workspacesList: "act.workspaces.list",
};

// Live views of our prefs. Read them as ActPrefs.actuentEnabled etc.
//
// These read the pref every time instead of caching. Pref reads are cheap,
// and a cache could still hold the old value inside a pref observer.
export const ActPrefs = {};

const defs = [
  ["actuentEnabled", true],
  ["actuentEndpoint", "https://api.actuent.ai"],
  ["actuentUrlbar", true],
  ["actuentUrlbarMax", 3],
  ["actuentSiteActions", true],
  ["compactMode", false],
  ["sidebarToolbar", false],
  ["extensionsInSidebar", true],
  ["newtabEnabled", true],
  ["agentsEnabled", false],
  ["agentsPort", 9222],
  ["framingAllowAll", true],
  ["updateEnabled", true],
  ["updateLastCheck", 0],
  ["updateIntervalHours", 6],
  ["workspacesEnabled", true],
  ["workspacesList", "[]"],
];

for (let [key, fallback] of defs) {
  let name = PREF[key];
  let get;
  switch (typeof fallback) {
    case "boolean":
      get = () => Services.prefs.getBoolPref(name, fallback);
      break;
    case "number":
      get = () => Services.prefs.getIntPref(name, fallback);
      break;
    default:
      get = () => Services.prefs.getStringPref(name, fallback);
  }
  Object.defineProperty(ActPrefs, key, { get, enumerable: true });
}

/**
 * Write a pref without caring about its type.
 */
export function setActPref(name, value) {
  switch (typeof value) {
    case "boolean":
      Services.prefs.setBoolPref(name, value);
      break;
    case "number":
      Services.prefs.setIntPref(name, Math.round(value));
      break;
    default:
      Services.prefs.setStringPref(name, String(value));
  }
}

/**
 * Calls `callback(prefName)` whenever one of the given prefs changes.
 * Returns a function that removes the observers again.
 */
export function watchPrefs(names, callback) {
  if (names.some(name => !name)) {
    // An empty name would watch every pref in the browser.
    throw new Error("watchPrefs: missing pref name");
  }
  let observer = (_subject, _topic, data) => callback(data);
  for (let name of names) {
    Services.prefs.addObserver(name, observer);
  }
  return () => {
    for (let name of names) {
      Services.prefs.removeObserver(name, observer);
    }
  };
}
