/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Zen-ish layout: the toolbar (address bar, back/forward...) sits on top
// of the tab sidebar instead of across the window, so the page gets the full
// height. Most of it is CSS in act-browser.css, keyed on [act-sidebar-toolbar].
// This file feeds the CSS the sizes it can't know: how wide the sidebar is
// and how tall the toolbar ends up once it wraps.
//
// It also adds the hover strip on the window edge that brings the sidebar
// back in compact mode.

"use strict";

var ActLayout = {
  _observer: null,
  hotzone: null,

  init() {
    this.hotzone = document.createXULElement("box");
    this.hotzone.id = "act-hotzone";
    document.getElementById("browser").append(this.hotzone);

    this._observer = new ResizeObserver(() => this._measure());
    this._observer.observe(document.getElementById("sidebar-container"));
    this._observer.observe(gNavToolbox);
    this.update();
  },

  uninit() {
    this._observer?.disconnect();
    this._observer = null;
  },

  update() {
    this._ensureSidebarWidth();
    this._measure();
  },

  // The window buttons and the toolbar share the top row of the sidebar, so
  // it needs to be a bit wider than Firefox's default. Wider is fine, the
  // user's own width is kept as long as it's at least this.
  _ensureSidebarWidth() {
    const MIN_WIDTH = 270;
    let state = window.SidebarController?._state;
    if (
      !state ||
      !document.documentElement.hasAttribute("act-sidebar-toolbar") ||
      !state.launcherExpanded
    ) {
      return;
    }
    if (!state.expandedLauncherWidth || state.expandedLauncherWidth < MIN_WIDTH) {
      state.expandedLauncherWidth = MIN_WIDTH;
    }
  },

  _measure() {
    let root = document.documentElement;
    let sidebar = document.getElementById("sidebar-container");
    let width = Math.round(sidebar.getBoundingClientRect().width);
    let height = Math.round(gNavToolbox.getBoundingClientRect().height);
    if (width) {
      root.style.setProperty("--act-sidebar-width", `${width}px`);
    }
    root.style.setProperty("--act-toolbox-height", `${height}px`);
  },
};
