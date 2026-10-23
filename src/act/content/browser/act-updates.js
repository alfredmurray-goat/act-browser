/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The "update ready" bar. The updating itself happens in ActUpdater.

"use strict";

var ActUpdateBar = {
  _observer: null,

  init() {
    this._observer = () => this.update();
    Services.obs.addObserver(this._observer, "act-update-state");
    this.update();
  },

  uninit() {
    if (this._observer) {
      Services.obs.removeObserver(this._observer, "act-update-state");
      this._observer = null;
    }
  },

  get updater() {
    return ChromeUtils.importESModule("resource://act/ActUpdater.sys.mjs").ActUpdater;
  },

  update() {
    let updater = this.updater;
    let ready = updater.state == "ready";
    document.documentElement.toggleAttribute("act-update-ready", ready);

    let box = gNotificationBox;
    let existing = box.getNotificationWithValue("act-update-ready");
    if (!ready) {
      existing?.close();
      return;
    }
    if (existing) {
      return;
    }
    box.appendNotification(
      "act-update-ready",
      {
        label: `Act Browser ${updater.available?.version || ""} is ready. It installs when you quit.`,
        priority: box.PRIORITY_INFO_MEDIUM,
      },
      [
        {
          label: "Restart now",
          accessKey: "R",
          callback: () => {
            updater.restartToUpdate();
            return true;
          },
        },
      ]
    );
  },
};
