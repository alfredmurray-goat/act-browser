/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Zen-ish layout. By default the tab sidebar runs to the top of the
// window and the toolbar sits above the page only; with
// act.layout.sidebarToolbar the toolbar moves into the sidebar instead. Most
// of it is CSS in act-browser.css. This file adds the sidebar header and
// feeds the CSS the sizes it can't know: how wide the sidebar is and how
// tall the toolbar is.
//
// It also adds the hover strip on the window edge that brings the sidebar
// back in compact mode.

"use strict";

var ActLayout = {
  _observer: null,
  hotzone: null,

  init() {
    this._buildHeader();
    this._buildFooter();
    this._hideSidebarTools();

    this.hotzone = document.createXULElement("box");
    this.hotzone.id = "act-hotzone";
    document.getElementById("browser").append(this.hotzone);

    this._observer = new ResizeObserver(() => this._measure());
    this._observer.observe(document.getElementById("sidebar-container"));
    this._observer.observe(gNavToolbox);
    this.update();
  },

  // Top of the sidebar: an empty, draggable row where macOS puts the window
  // buttons, then the workspace name with the workspace switcher next to it
  // (act-workspaces.js adds that).
  _buildHeader() {
    let header = document.createXULElement("vbox");
    header.id = "act-sidebar-header";
    let titlebar = document.createXULElement("box");
    titlebar.id = "act-sidebar-titlebar";
    let row = document.createXULElement("hbox");
    row.id = "act-sidebar-titlerow";
    row.setAttribute("align", "center");
    let title = document.createXULElement("label");
    title.id = "act-workspace-title";
    title.setAttribute("crop", "end");
    title.setAttribute("context", "act-workspace-menu");
    row.append(title);
    header.append(titlebar, row);
    document.getElementById("sidebar-container").prepend(header);
  },

  // Bottom of the sidebar: settings, bookmarks and history, then downloads
  // (act-extensions.js). Extension icons stack up from its right end.
  _buildFooter() {
    let footer = document.createXULElement("hbox");
    footer.id = "act-sidebar-footer";
    footer.setAttribute("align", "center");

    let button = (id, label, icon, onCommand) => {
      let b = document.createXULElement("toolbarbutton");
      b.id = id;
      b.className = "toolbarbutton-1 act-sidebar-tool";
      b.setAttribute("tooltiptext", label);
      b.setAttribute("aria-label", label);
      b.setAttribute("image", icon);
      b.addEventListener("command", onCommand);
      return b;
    };
    footer.append(
      button("act-tool-settings", "Settings", "chrome://global/skin/icons/settings.svg", () =>
        openPreferences()
      ),
      button(
        "act-tool-bookmarks",
        "Saved sites (bookmarks)",
        "chrome://browser/skin/bookmark-hollow.svg",
        () => SidebarController.toggle("viewBookmarksSidebar")
      ),
      button("act-tool-history", "History", "chrome://browser/skin/history.svg", () =>
        SidebarController.toggle("viewHistorySidebar")
      )
    );
    document.getElementById("sidebar-container").append(footer);
  },

  // Firefox's own sidebar puts bookmarks, history and a settings button
  // under the tabs. Zen doesn't, and with our footer it's one row too many.
  // They're inside the sidebar's shadow DOM, so the CSS has to go in there.
  _hideSidebarTools() {
    let main = document.querySelector("sidebar-main");
    let root = main?.shadowRoot;
    if (!root) {
      // Not rendered yet.
      setTimeout(() => this._hideSidebarTools(), 200);
      return;
    }
    let sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      :host(:not([act-show-tools])) .buttons-wrapper,
      :host(:not([act-show-tools])) .wrapper > splitter {
        display: none !important;
      }
    `);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
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
