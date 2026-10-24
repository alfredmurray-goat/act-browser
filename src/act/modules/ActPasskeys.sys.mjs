/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Passkeys go to Bitwarden. Act can't use the Mac's own passkeys (that
// needs Apple's entitlement, see usePasskeysWithoutApple() in
// scripts/build.mjs), so Firefox's handler can only ask for a USB security
// key.
//
// While someone is logged in, Bitwarden answers sites' passkey requests
// itself and only hands one to Firefox when they pick "use a security key",
// or the site accepts nothing else. Logged out, it stays out of the way, so
// sites got Firefox's "Touch your security key". Act replaces that box with
// one that sends people to Bitwarden.

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ExtensionParent: "resource://gre/modules/ExtensionParent.sys.mjs",
  WebAuthnPromptHelper: "moz-src:///toolkit/modules/WebAuthnPromptHelper.sys.mjs",
});
XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "webauthnService",
  "@mozilla.org/webauthn/service;1",
  Ci.nsIWebAuthnService
);

export const BITWARDEN_ID = "{446900e4-71c2-419f-a6a7-df9c091e268b}";

function bitwarden() {
  let policy = WebExtensionPolicy.getByID(BITWARDEN_ID);
  return policy?.active ? policy : null;
}

// Bitwarden registers its passkey scripts once someone logs in (with
// passkeys turned on in its settings), and removes them on log out.
function bitwardenHandlesPasskeys(policy) {
  return policy.contentScripts.some(script =>
    script.jsPaths.some(path => path.includes("fido2-content-script"))
  );
}

function openBitwarden(win) {
  let policy = bitwarden();
  if (!policy) {
    return;
  }
  try {
    let action = lazy.ExtensionParent.apiManager.global.browserActionFor(policy.extension);
    if (action) {
      action.openPopup(win);
      return;
    }
  } catch (e) {
    console.error("Act: Bitwarden popup", e);
  }
  // Bitwarden's own "pop out" window.
  win.open(
    policy.getURL("popup/index.html?uilocation=popout"),
    "_blank",
    "popup,width=380,height=630"
  );
}

function cancelRequest(tid) {
  lazy.webauthnService.cancel(tid);
}

let patched = false;

export const ActPasskeys = {
  init() {
    if (patched) {
      return;
    }
    patched = true;
    let helper = lazy.WebAuthnPromptHelper;
    let original = helper.presence_required;
    helper.presence_required = function (browsingContext, data) {
      let policy = bitwarden();
      if (!policy || bitwardenHandlesPasskeys(policy)) {
        original.call(this, browsingContext, data);
        return;
      }
      let { tid } = data;
      let win = browsingContext.topChromeWindow;
      this.show_formatted_msg(
        browsingContext,
        tid,
        "presence",
        "Log in to Bitwarden to use your saved passkeys. Then try signing in to this site again.",
        {
          label: "Open Bitwarden",
          accessKey: "O",
          callback() {
            cancelRequest(tid);
            openBitwarden(win);
          },
        },
        [
          {
            label: "Use a security key",
            accessKey: "U",
            callback() {
              // Firefox's request is still waiting: show its own box.
              win.setTimeout(() => original.call(helper, browsingContext, data), 0);
            },
          },
          {
            label: "Cancel",
            accessKey: "C",
            callback() {
              cancelRequest(tid);
            },
          },
        ],
        { escAction: "buttoncommand" }
      );
    };
  },
};

