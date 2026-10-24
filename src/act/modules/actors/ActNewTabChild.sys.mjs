/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Act new tab page runs as ordinary web content (so it can show the
// Rejn weather iframe safely). This gives it a small window.ActNewTab API
// for the few things it needs from the browser. The actor is only
// registered for the new tab page's own URL.

const METHODS = [
  "state",
  "search",
  "topSites",
  "webSearchUrl",
  "openInBackground",
  "savedSites",
  "saveSite",
  "removeSite",
  "weatherShown",
  "wallpaper",
  "setWallpaper",
];

export class ActNewTabChild extends JSWindowActorChild {
  handleEvent(event) {
    if (event.type == "DOMDocElementInserted") {
      this.#expose();
    }
  }

  #expose() {
    let win = this.contentWindow;
    let api = Cu.createObjectIn(win, { defineAs: "ActNewTab" });
    for (let name of METHODS) {
      Cu.exportFunction(
        (...args) =>
          new win.Promise((resolve, reject) => {
            this.sendQuery(`ActNewTab:${name}`, args).then(
              result => resolve(Cu.cloneInto(result ?? null, win)),
              error => reject(new win.Error(String(error?.message || error)))
            );
          }),
        api,
        { defineAs: name }
      );
    }
  }
}
