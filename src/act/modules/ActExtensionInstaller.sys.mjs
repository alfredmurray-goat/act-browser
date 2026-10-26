/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Ensures bundled extensions (uBlock Origin, Windscribe VPN, Bitwarden) are
// installed into existing profiles, not just new ones. distribution/extensions
// only covers first-run profiles.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
});

const PREF_DONE = "act.extensions.installed";

const BUNDLED = [
  { id: "uBlock0@raymondhill.net", file: "uBlock0@raymondhill.net.xpi" },
  { id: "@windscribeff", file: "@windscribeff.xpi" },
  { id: "{446900e4-71c2-419f-a6a7-df9c091e268b}", file: "{446900e4-71c2-419f-a6a7-df9c091e268b}.xpi" },
];

export const ActExtensionInstaller = {
  async init() {
    if (Services.prefs.getBoolPref(PREF_DONE, false)) {
      return;
    }
    try {
      let am = lazy.AddonManager;
      await am.startup();
      let dir = Services.dirsvc.get("GreD", Ci.nsIFile);
      dir.append("distribution");
      dir.append("extensions");
      for (let ext of BUNDLED) {
        try {
          let existing = await am.getAddonByID(ext.id);
          if (existing) continue;
          let file = dir.clone();
          file.append(ext.file);
          if (!file.exists()) continue;
          let install = await am.getInstallForFile(file, { source: "application" });
          if (install) {
            await install.install();
          }
        } catch (e) {
          console.error("Act: extension install", ext.id, e);
        }
      }
    } catch (e) {
      console.error("Act: extension installer", e);
    }
    Services.prefs.setBoolPref(PREF_DONE, true);
  },
};
