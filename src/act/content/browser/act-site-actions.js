/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The "act" button in the address bar. When the site you're on has actions
// (book a table, see pricing, contact...), either in its own
// /.well-known/lawp.json or in Actuent's index, the button lights up and
// lists them.

"use strict";

var ActSiteActions = {
  HTML_NS: "http://www.w3.org/1999/xhtml",

  button: null,
  panel: null,
  site: null,
  _timer: null,
  _abort: null,
  _listener: null,

  get enabled() {
    return (
      ActBrowser.actuentEnabled &&
      ActBrowser.prefs.actuentSiteActions &&
      !PrivateBrowsingUtils.isWindowPrivate(window)
    );
  },

  init() {
    this.button = document.createXULElement("hbox");
    this.button.id = "act-site-button";
    this.button.className = "urlbar-page-action";
    this.button.setAttribute("role", "button");
    this.button.setAttribute("tooltiptext", "Things you can do on this site");
    this.button.hidden = true;
    let icon = document.createXULElement("image");
    icon.className = "urlbar-icon";
    let badge = document.createXULElement("label");
    badge.id = "act-site-badge";
    this.button.append(icon, badge);
    this.button.addEventListener("click", e => {
      if (e.button == 0) {
        this.openPanel();
      }
    });
    this.button.addEventListener("keypress", e => {
      if (e.key == "Enter" || e.key == " ") {
        this.openPanel();
      }
    });
    document.getElementById("page-action-buttons").prepend(this.button);

    this._listener = {
      onLocationChange: (webProgress, _request, _location, flags) => {
        if (
          webProgress.isTopLevel &&
          !(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)
        ) {
          this._schedule();
        }
      },
    };
    gBrowser.addProgressListener(this._listener);
    this._onTabSelect = () => this._schedule(0);
    gBrowser.tabContainer.addEventListener("TabSelect", this._onTabSelect);

    this.update();
  },

  uninit() {
    if (this._listener) {
      gBrowser.removeProgressListener(this._listener);
      gBrowser.tabContainer.removeEventListener("TabSelect", this._onTabSelect);
      this._listener = null;
    }
    clearTimeout(this._timer);
    this._abort?.abort();
  },

  update() {
    if (this.enabled) {
      this._schedule(0);
    } else {
      this._abort?.abort();
      this._show(null);
    }
  },

  _schedule(delay = 500) {
    clearTimeout(this._timer);
    this._abort?.abort();
    this._show(null);
    if (!this.enabled) {
      return;
    }
    this._timer = setTimeout(() => this._lookup(), delay);
  },

  async _lookup() {
    let browser = gBrowser.selectedBrowser;
    let uri = browser.currentURI;
    if (!uri?.schemeIs("https") && !uri?.schemeIs("http")) {
      return;
    }
    let host;
    try {
      host = uri.host;
    } catch {
      return;
    }

    let abort = (this._abort = new AbortController());
    let site = await Actuent.lookupSite(host, { signal: abort.signal });
    // Make sure we're still on the same page.
    if (abort.signal.aborted || gBrowser.selectedBrowser != browser) {
      return;
    }
    this._show(site?.actions.length ? site : null);
  },

  _show(site) {
    this.site = site;
    if (!this.button) {
      return;
    }
    this.button.hidden = !site;
    this.button.toggleAttribute("native", !!site?.native);
    document.getElementById("act-site-badge").value = site
      ? String(site.actions.length)
      : "";
  },

  _buildPanel() {
    this.panel = document.createXULElement("panel");
    this.panel.id = "act-site-panel";
    this.panel.setAttribute("type", "arrow");
    this.panel.setAttribute("position", "bottomright topright");
    this.panel.setAttribute("role", "dialog");
    let body = document.createElementNS(this.HTML_NS, "div");
    body.id = "act-site-panel-body";
    this.panel.append(body);
    document.getElementById("mainPopupSet").append(this.panel);
  },

  _el(tag, className, text) {
    let el = document.createElementNS(this.HTML_NS, tag);
    if (className) {
      el.className = className;
    }
    if (text) {
      el.textContent = text;
    }
    return el;
  },

  openPanel() {
    let site = this.site;
    if (!site) {
      return;
    }
    if (!this.panel) {
      this._buildPanel();
    }
    let el = this._el.bind(this);
    let body = this.panel.querySelector("#act-site-panel-body");

    let header = el("div", "act-site-header");
    header.append(el("div", "act-site-name", site.name));
    let meta = [site.domain, site.category, site.city].filter(Boolean).join(" · ");
    header.append(el("div", "act-site-meta", meta));
    if (site.native) {
      header.append(el("span", "act-site-native", "Official LAWP"));
    }

    let children = [header];
    if (site.summary) {
      children.push(el("p", "act-site-summary", site.summary));
    }

    let list = el("div", "act-site-actions");
    for (let action of site.actions) {
      let item = el("button", "act-site-action");
      item.append(el("span", "act-site-action-name", action.name));
      if (action.description) {
        item.append(el("span", "act-site-action-desc", action.description));
      }
      item.addEventListener("click", () => this.runAction(action));
      list.append(item);
    }
    children.push(list);

    let footer = el("div", "act-site-footer");
    let similar = el("button", "act-site-link", "Find similar sites");
    similar.addEventListener("click", () => {
      this.panel.hidePopup();
      ActPopup.explore(`sites like ${site.domain}`);
    });
    footer.append(similar);
    footer.append(el("span", "act-site-source", "via Actuent"));
    children.push(footer);

    body.replaceChildren(...children);
    this.panel.openPopup(this.button, "bottomright topright");
  },

  // Actions with their own link go there. The rest (search, contact...)
  // don't come with a url, so the site's home page is the best we can do.
  runAction(action) {
    let site = this.site;
    this.panel?.hidePopup();
    let url = action.url || site?.homeUrl;
    if (url) {
      ActBrowser.openLink(url);
    }
  },
};
