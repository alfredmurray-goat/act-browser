/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The corner of the mirrored L at the bottom of the sidebar, next to the
// extension icons: what's playing (while a tab plays something) and, under
// it, the time, the date and the weather from Rejn.

"use strict";

var ActCorner = {
  HTML_NS: "http://www.w3.org/1999/xhtml",
  // Rejn's conditions (see ActWeather.sys.mjs).
  WEATHER_ICONS: {
    clear: "☀️",
    partly: "⛅",
    cloudy: "☁️",
    fog: "🌫️",
    drizzle: "🌦️",
    rain: "🌧️",
    snow: "🌨️",
    storm: "⛈️",
  },

  corner: null,
  _media: null,
  _tab: null,
  _controller: null,
  _clockTimer: null,
  _listeners: [],

  init() {
    this.corner = document.getElementById("act-corner");
    this._buildMedia();
    this._buildGlance();

    let on = (target, type, fn) => {
      target.addEventListener(type, fn);
      this._listeners.push([target, type, fn]);
    };
    on(gBrowser.tabContainer, "TabAttrModified", e => {
      if (e.detail.changed.includes("soundplaying") && e.target.soundPlaying) {
        this._follow(e.target);
      }
    });
    on(gBrowser.tabContainer, "TabClose", e => {
      if (e.target == this._tab) {
        this._follow(null);
      }
    });

    Services.obs.addObserver(this, "act-weather-changed");
    this._prefObserver = () => this.update();
    for (let pref of ["act.sidebar.nowPlaying", "act.sidebar.glance", "act.weather.enabled", "act.weather.units"]) {
      Services.prefs.addObserver(pref, this._prefObserver);
    }
    window.addEventListener("unload", () => this.uninit(), { once: true });

    this._tickClock();
    this.update();
  },

  uninit() {
    for (let [target, type, fn] of this._listeners) {
      target.removeEventListener(type, fn);
    }
    this._listeners = [];
    this._follow(null);
    clearTimeout(this._clockTimer);
    Services.obs.removeObserver(this, "act-weather-changed");
    for (let pref of ["act.sidebar.nowPlaying", "act.sidebar.glance", "act.weather.enabled", "act.weather.units"]) {
      Services.prefs.removeObserver(pref, this._prefObserver);
    }
  },

  observe() {
    this._renderWeather();
  },

  update() {
    let glance = Services.prefs.getBoolPref("act.sidebar.glance", true);
    this.glance.hidden = !glance;
    if (!Services.prefs.getBoolPref("act.sidebar.nowPlaying", true)) {
      this._follow(null);
    }
    this._renderMedia();
    this._renderWeather();
  },

  _el(tag, className, text) {
    let node = document.createElementNS(this.HTML_NS, tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  },

  _button(className, label, onClick) {
    let button = this._el("button", `act-corner-button ${className}`);
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", onClick);
    return button;
  },

  // --- Now playing -----------------------------------------------------------

  _buildMedia() {
    let media = this._el("div", "act-card");
    media.id = "act-now-playing";
    media.hidden = true;

    let info = this._el("button", "act-media-info");
    info.title = "Go to this tab";
    info.addEventListener("click", () => {
      if (this._tab) {
        gBrowser.selectedTab = this._tab;
      }
    });
    let art = this._el("img", "act-media-art");
    art.alt = "";
    let text = this._el("span", "act-media-text");
    text.append(this._el("span", "act-media-title"), this._el("span", "act-media-artist"));
    info.append(art, text);

    let controls = this._el("div", "act-media-controls");
    controls.append(
      this._button("act-media-prev", "Previous", () => this._controller?.prevTrack()),
      this._button("act-media-play", "Play", () => {
        if (this._controller?.isPlaying) {
          this._controller.pause();
        } else {
          this._controller?.play();
        }
      }),
      this._button("act-media-next", "Next", () => this._controller?.nextTrack())
    );

    media.append(info, controls);
    this.corner.append(media);
    this._media = media;
  },

  // Shows the tab's media until it's done (the page stops having media, or
  // the tab closes). The newest tab to start playing wins.
  _follow(tab) {
    if (tab && !Services.prefs.getBoolPref("act.sidebar.nowPlaying", true)) {
      tab = null;
    }
    if (tab == this._tab) {
      this._renderMedia();
      return;
    }
    let events = ["deactivated", "metadatachange", "playbackstatechange", "supportedkeyschange"];
    for (let type of events) {
      this._controller?.removeEventListener(type, this);
    }
    this._tab = tab;
    this._controller = tab?.linkedBrowser?.browsingContext?.mediaController || null;
    for (let type of events) {
      this._controller?.addEventListener(type, this);
    }
    this._renderMedia();
  },

  handleEvent(event) {
    if (event.type == "deactivated") {
      // Something else may still be playing.
      this._follow(gBrowser.tabs.find(t => t.soundPlaying && t != this._tab) || null);
      return;
    }
    this._renderMedia();
  },

  _renderMedia() {
    let controller = this._controller;
    let tab = this._tab;
    if (!tab || !controller) {
      this._media.hidden = true;
      return;
    }
    let metadata = null;
    try {
      metadata = controller.getMetadata();
    } catch {
      // No metadata from the page (plain <video>), use the tab.
    }
    let host = "";
    try {
      host = tab.linkedBrowser.currentURI.host.replace(/^www\./, "");
    } catch {}

    let title = metadata?.title || tab.label;
    this._media.querySelector(".act-media-title").textContent = title;
    this._media.querySelector(".act-media-artist").textContent = metadata?.artist || host;
    this._media.querySelector(".act-media-info").title = `${title}: go to this tab`;

    let art = this._media.querySelector(".act-media-art");
    let artwork = metadata?.artwork?.find(a => /^https?:|^data:image\//.test(a.src));
    art.src = artwork?.src || tab.image || "chrome://global/skin/icons/defaultFavicon.svg";

    let playing = controller.isPlaying;
    let play = this._media.querySelector(".act-media-play");
    play.classList.toggle("playing", playing);
    play.title = playing ? "Pause" : "Play";
    play.setAttribute("aria-label", play.title);

    let keys = controller.supportedKeys || [];
    this._media.querySelector(".act-media-prev").disabled = !keys.includes("previoustrack");
    this._media.querySelector(".act-media-next").disabled = !keys.includes("nexttrack");
    this._media.hidden = false;
  },

  // --- Time and weather ------------------------------------------------------

  _buildGlance() {
    let glance = this._el("div", "act-card");
    glance.id = "act-glance";
    let clock = this._el("div", "act-glance-clock");
    clock.append(this._el("span", "act-glance-time"), this._el("span", "act-glance-date"));

    let weather = this._el("div", "act-glance-weather");
    weather.hidden = true;
    let credit = this._el("a", "act-glance-credit", "Rejn");
    credit.href = "https://rejn.app/";
    credit.title = "Weather from Rejn";
    credit.addEventListener("click", e => {
      e.preventDefault();
      ActBrowser.openLink(credit.href);
    });
    weather.append(this._el("span", "act-glance-temp"), this._el("span", "act-glance-place"), credit);

    // Pomodoro timer
    let timer = this._el("div", "act-glance-timer");
    timer.hidden = true;
    let timerBtn = this._button("act-timer-btn", "Start 25-minute focus timer", () => this._toggleTimer());
    timerBtn.textContent = "🍅";
    let timerDisplay = this._el("span", "act-glance-timer-display", "");
    timer.append(timerBtn, timerDisplay);
    glance.append(clock, weather, timer);
    this.corner.append(glance);
    this.glance = glance;
    this._timerEl = timer;
    try { this._timerInterval = null; } catch (e) {}
    this._timerRemaining = 0;
    this._timerRunning = false;
    this._timerDisplay = timerDisplay;
    this._timerBtn = timerBtn;
  },

  _toggleTimer() {
    if (this._timerRunning) {
      this._stopTimer();
    } else {
      this._startTimer(25 * 60);
    }
  },

  _startTimer(seconds) {
    this._timerRunning = true;
    this._timerRemaining = seconds;
    this._timerEl.hidden = false;
    this._timerBtn.textContent = "⏹";
    this._timerBtn.title = "Stop timer";
    this._updateTimerDisplay();
    this._timerInterval = setInterval(() => {
      this._timerRemaining--;
      if (this._timerRemaining <= 0) {
        this._stopTimer();
        try {
          Services.obs.notifyObservers(null, "alertservice-alert-show", "Focus timer done!");
        } catch {}
        // Play a beep via notification
        try {
          let box = gNotificationBox;
          box?.appendNotification("act-timer-done", { label: "Focus timer complete! Take a break.", priority: box.PRIORITY_INFO_MEDIUM });
        } catch {}
      } else {
        this._updateTimerDisplay();
      }
    }, 1000);
  },

  _stopTimer() {
    this._timerRunning = false;
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    this._timerBtn.textContent = "🍅";
    this._timerBtn.title = "Start 25-minute focus timer";
    this._timerDisplay.textContent = "";
    this._timerEl.hidden = true;
  },

  _updateTimerDisplay() {
    let m = Math.floor(this._timerRemaining / 60);
    let sec = this._timerRemaining % 60;
    this._timerDisplay.textContent = `${m}:${String(sec).padStart(2, "0")}`;
  },

  _tickClock() {
    let now = new Date();
    this.glance.querySelector(".act-glance-time").textContent = now.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    this.glance.querySelector(".act-glance-date").textContent = now.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    // Next tick on the minute.
    this._clockTimer = setTimeout(() => this._tickClock(), 60000 - (now % 60000) + 50);
  },

  _renderWeather() {
    let box = this.glance.querySelector(".act-glance-weather");
    let { ActWeather } = ChromeUtils.importESModule("resource://act/ActWeather.sys.mjs");
    let data = ActWeather.latest;
    if (!data || !Services.prefs.getBoolPref("act.weather.enabled", true)) {
      box.hidden = true;
      return;
    }
    let imperial = Services.prefs.getStringPref("act.weather.units", "") == "imperial";
    let temp = imperial ? `${Math.round((data.tempC * 9) / 5 + 32)}°F` : `${Math.round(data.tempC)}°`;
    let icon = this.WEATHER_ICONS[data.condition] || "";
    box.querySelector(".act-glance-temp").textContent = `${icon} ${temp}`.trim();
    box.querySelector(".act-glance-place").textContent = data.place;
    box.title = [data.conditionText, data.place].filter(Boolean).join(", ");
    box.querySelector(".act-glance-credit").href = data.link;
    box.hidden = false;
  },
};
