/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Lets AI agents (Claude Code, Codex, anything that speaks MCP) drive the
// browser. When switched on we start Firefox's built-in WebDriver BiDi
// server on localhost. agent/act-mcp.mjs is the MCP server the agents talk
// to, it connects here and draws the agent's cursor on the page.
//
// Off by default: while it's on, any program on this computer can control
// the browser.

import { ActPrefs, PREF, watchPrefs } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  RemoteAgent: "chrome://remote/content/components/RemoteAgent.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const DYNAMIC_START_PREF = "remote.experimental.dynamicstart.enabled";

let started = false;
let busy = Promise.resolve();

function setWindowsState(on) {
  for (let win of Services.wm.getEnumerator("navigator:browser")) {
    win.document.documentElement.toggleAttribute("act-agents", on);
  }
}

// The remote agent refuses to start while the browser is still starting.
async function startupFinished() {
  for (let i = 0; i < 120 && Services.startup.startingUp; i++) {
    await new Promise(resolve => lazy.setTimeout(resolve, 500));
  }
}

async function start() {
  if (started) {
    return;
  }
  await startupFinished();
  if (!ActPrefs.agentsEnabled) {
    return;
  }
  Services.prefs.setBoolPref(DYNAMIC_START_PREF, true);
  let port = await lazy.RemoteAgent.startAtRuntime({
    isBrowserAutomation: false,
  });
  if (port > 0) {
    started = true;
    Services.prefs.setIntPref(PREF.agentsPort, port);
    setWindowsState(true);
  } else if (lazy.RemoteAgent.running) {
    // Already running, e.g. started with --remote-debugging-port.
    setWindowsState(true);
  } else {
    Cu.reportError("Act: couldn't start the agent server");
  }
}

async function stop() {
  setWindowsState(false);
  if (!started) {
    return;
  }
  started = false;
  await lazy.RemoteAgent.stopAtRuntime();
}

function sync() {
  // Starting and stopping are async, never let two overlap.
  busy = busy
    .then(() => (ActPrefs.agentsEnabled ? start() : stop()))
    .catch(e => Cu.reportError(e));
  return busy;
}

export const ActAgents = {
  _registered: false,

  init() {
    if (this._registered) {
      return;
    }
    this._registered = true;
    watchPrefs([PREF.agentsEnabled], sync);
    sync();
  },

  get running() {
    return started || lazy.RemoteAgent.running;
  },

  /**
   * Path of the MCP server script that agents should run.
   */
  get serverPath() {
    let file = Services.dirsvc.get("GreD", Ci.nsIFile);
    file.append("agent");
    file.append("act-mcp.mjs");
    return file.path;
  },
};
