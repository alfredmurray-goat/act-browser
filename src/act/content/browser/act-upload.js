/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The little menu that pops up when a site asks for a file and there's an
// image on the clipboard. See modules/actors/ActUpload*.sys.mjs.

"use strict";

var ActUploadMenu = {
  HTML_NS: "http://www.w3.org/1999/xhtml",
  panel: null,
  _resolve: null,
  _thumbUrl: null,

  init() {},

  _build() {
    let el = (tag, props = {}) =>
      Object.assign(document.createElementNS(this.HTML_NS, tag), props);

    this.panel = document.createXULElement("panel");
    this.panel.id = "act-upload-panel";
    this.panel.setAttribute("type", "arrow");
    this.panel.setAttribute("role", "dialog");

    let body = el("div", { id: "act-upload-body" });
    let title = el("div", { className: "act-upload-title", textContent: "Upload" });

    let row = (id, icon, heading, detail) => {
      let button = el("button", { id, className: "act-upload-option" });
      let text = el("span", { className: "act-upload-text" });
      text.append(el("strong", { textContent: heading }));
      if (detail) {
        text.append(el("small", detail));
      }
      button.append(icon, text);
      return button;
    };

    let thumb = el("img", { id: "act-upload-thumb", alt: "" });
    let clip = row("act-upload-clipboard", thumb, "Image from clipboard", {
      id: "act-upload-size",
    });
    clip.addEventListener("click", () => this._done("clipboard"));

    let folder = el("span", { className: "act-upload-icon" });
    let pick = row("act-upload-pick", folder, "Choose a file…");
    pick.addEventListener("click", () => this._done("pick"));

    // Up and down move between the two, like a menu.
    body.addEventListener("keydown", e => {
      if (e.key == "ArrowDown" || e.key == "ArrowUp") {
        e.preventDefault();
        (document.activeElement == clip ? pick : clip).focus();
      }
    });

    body.append(title, clip, pick);
    this.panel.append(body);
    this.panel.addEventListener("popuphidden", () => this._done(null));
    document.getElementById("mainPopupSet").append(this.panel);
  },

  _done(choice) {
    let resolve = this._resolve;
    this._resolve = null;
    if (this._thumbUrl) {
      URL.revokeObjectURL(this._thumbUrl);
      this._thumbUrl = null;
    }
    if (this.panel.state != "closed") {
      this.panel.hidePopup();
    }
    resolve?.(choice);
  },

  /**
   * Shows the menu at the given screen position. Resolves to "clipboard",
   * "pick" or null when dismissed.
   */
  show({ screenX, screenY, image }) {
    if (!image) {
      return Promise.resolve("pick");
    }
    if (!this.panel) {
      this._build();
    }
    this._resolve?.(null);

    let blob = new Blob([image.bytes], { type: image.type });
    this._thumbUrl = URL.createObjectURL(blob);
    document.getElementById("act-upload-thumb").src = this._thumbUrl;
    let kb = Math.max(1, Math.round(image.bytes.length / 1024));
    let size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
    let kind = image.type.split("/")[1].toUpperCase().replace("JPEG", "JPG");
    document.getElementById("act-upload-size").textContent = `${kind} · ${size}`;

    return new Promise(resolve => {
      this._resolve = resolve;
      this.panel.openPopupAtScreen(Math.round(screenX), Math.round(screenY), false);
      document.getElementById("act-upload-clipboard").focus();
    });
  },
};
