/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Lets any site be shown inside another site's iframe.
//
// Many sites send `X-Frame-Options` or a CSP `frame-ancestors` rule to say
// "don't put me in a frame", and Firefox then shows "can't open this page"
// instead. With act.framing.allowAll on, we drop those two rules from
// responses that are loading into a frame. Nothing else is touched: other
// CSP directives stay, and top-level pages are left alone.
//
// The protection exists against clickjacking (a page hiding another site in
// a frame and tricking you into clicking it). Firefox keeps a framed site's
// cookies separate from the real site's (Total Cookie Protection), so the
// framed copy isn't logged in as you, which takes most of the sting out of
// that. It's still a trade-off, hence the switch.

import { ActPrefs, PREF, watchPrefs } from "resource://act/ActPrefs.sys.mjs";

const TOPICS = [
  "http-on-examine-response",
  "http-on-examine-cached-response",
  "http-on-examine-merged-response",
];

function withoutFrameAncestors(csp) {
  // A header can hold several policies (comma separated), each a list of
  // directives (semicolon separated).
  return csp
    .split(",")
    .map(policy =>
      policy
        .split(";")
        .filter(directive => !/^\s*frame-ancestors(\s|$)/i.test(directive))
        .join(";")
    )
    .filter(policy => policy.trim())
    .join(",");
}

const observer = {
  observe(subject) {
    let channel;
    try {
      channel = subject.QueryInterface(Ci.nsIHttpChannel);
    } catch {
      return;
    }
    if (channel.loadInfo?.externalContentPolicyType != Ci.nsIContentPolicy.TYPE_SUBDOCUMENT) {
      return;
    }

    try {
      channel.getResponseHeader("X-Frame-Options");
      channel.setResponseHeader("X-Frame-Options", "", false);
    } catch {
      // Not there, nothing to do.
    }

    for (let name of ["Content-Security-Policy", "Content-Security-Policy-Report-Only"]) {
      let csp;
      try {
        csp = channel.getResponseHeader(name);
      } catch {
        continue;
      }
      if (/frame-ancestors/i.test(csp)) {
        channel.setResponseHeader(name, withoutFrameAncestors(csp), false);
      }
    }
  },
};

let observing = false;

function sync() {
  let on = ActPrefs.framingAllowAll;
  if (on == observing) {
    return;
  }
  for (let topic of TOPICS) {
    if (on) {
      Services.obs.addObserver(observer, topic);
    } else {
      Services.obs.removeObserver(observer, topic);
    }
  }
  observing = on;
}

export const ActFraming = {
  _started: false,

  init() {
    if (this._started) {
      return;
    }
    this._started = true;
    watchPrefs([PREF.framingAllowAll], sync);
    sync();
  },

  // For tests.
  withoutFrameAncestors,
};
