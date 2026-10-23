/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Keeps Act Browser up to date from the project's GitHub releases.
//
// Firefox's own updater can't be used: it only accepts update files signed
// with Mozilla's keys. So:
//
//   1. Every few hours we look at the latest release on GitHub.
//   2. If it's newer, we download the build for this platform and check it
//      against an Ed25519 signature made with the project's update key (the
//      public half is baked into every build). No valid signature, no update.
//   3. It's unpacked next to the profile and installed when the browser
//      quits: a small script waits for us to exit, swaps the app and, after
//      "Restart to update", starts it again.

import { ActPrefs, PREF, setActPref } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
});

const FIRST_CHECK_DELAY_MS = 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

const STATE_TOPIC = "act-update-state";

function readTextFile(file) {
  let stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  stream.init(file, -1, 0, 0);
  let text = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  text.init(stream);
  let data = text.read(stream.available());
  stream.close();
  return new TextDecoder().decode(Uint8Array.from(data, c => c.charCodeAt(0)));
}

function writeTextFile(file, text, permissions = 0o644) {
  let out = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
    Ci.nsIFileOutputStream
  );
  // write only | create | truncate
  out.init(file, 0x02 | 0x08 | 0x20, permissions, 0);
  let bytes = String.fromCharCode(...new TextEncoder().encode(text));
  out.write(bytes, bytes.length);
  out.close();
}

/**
 * Info about this build, written by scripts/build.mjs. Missing in dev
 * builds, which never update themselves.
 */
function buildInfo() {
  try {
    let file = Services.dirsvc.get("GreD", Ci.nsIFile);
    file.append("act");
    file.append("build.json");
    return file.exists() ? JSON.parse(readTextFile(file)) : null;
  } catch (e) {
    console.error("Act: couldn't read build.json", e);
    return null;
  }
}

/**
 * Compares "1.2.3" style versions. Returns >0 if a is newer than b.
 */
export function compareVersions(a, b) {
  let pa = String(a).replace(/^v/, "").split(/[.-]/).map(n => parseInt(n) || 0);
  let pb = String(b).replace(/^v/, "").split(/[.-]/).map(n => parseInt(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    let diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) {
      return diff;
    }
  }
  return 0;
}

/**
 * What gets signed for a release asset. Including platform and version
 * means an old (validly signed) build can't be passed off as a new one.
 */
export function signedMessage(platform, version, sha256) {
  return `act-browser-update:${platform}:${version}:${sha256}`;
}

function sha256File(path) {
  let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  let stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  stream.init(file, -1, 0, 0);
  let hash = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  hash.init(Ci.nsICryptoHash.SHA256);
  hash.updateFromStream(stream, 0xffffffff);
  stream.close();
  let binary = hash.finish(false);
  return Array.from(binary, c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));
}

export async function verifySignature(publicKeyB64, message, signatureB64) {
  let subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto isn't available");
  }
  let key = await subtle.importKey(
    "raw",
    base64ToBytes(publicKeyB64),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  return subtle.verify(
    { name: "Ed25519" },
    key,
    base64ToBytes(signatureB64),
    new TextEncoder().encode(message)
  );
}

function isMac() {
  return Services.appinfo.OS == "Darwin";
}

function isWindows() {
  return Services.appinfo.OS == "WINNT";
}

// A program in Windows' System32 folder.
function system32(...parts) {
  let file = Services.dirsvc.get("SysD", Ci.nsIFile);
  for (let part of parts) {
    file.append(part);
  }
  return file.path;
}

// The .app bundle (macOS) or install folder (Linux) we're running from.
function installDir() {
  let exe = Services.dirsvc.get("XREExeF", Ci.nsIFile);
  if (isMac()) {
    // .../Act Browser.app/Contents/MacOS/firefox
    return exe.parent.parent.parent;
  }
  return exe.parent;
}

function updatesDir() {
  let dir = Services.dirsvc.get("ProfD", Ci.nsIFile);
  dir.append("act-updates");
  return dir;
}

async function run(command, args) {
  let proc = await lazy.Subprocess.call({ command, arguments: args, stderr: "stdout" });
  let output = "";
  let chunk;
  while ((chunk = await proc.stdout.readString())) {
    output += chunk;
  }
  let { exitCode } = await proc.wait();
  if (exitCode != 0) {
    throw new Error(`${command} failed (${exitCode}): ${output.slice(0, 300)}`);
  }
  return output;
}

export const ActUpdater = {
  // "idle", "checking", "downloading", "ready", "up-to-date", "error",
  // "unsupported"
  state: "idle",
  message: "",
  available: null,
  staged: null,
  _timer: null,
  _restartAfterInstall: false,

  get info() {
    if (this._info === undefined) {
      this._info = buildInfo();
    }
    return this._info;
  },

  get currentVersion() {
    return this.info?.version || "dev";
  },

  get supported() {
    let info = this.info;
    return !!(info?.version && info.repo && info.publicKey && info.platform);
  },

  _set(state, message = "") {
    this.state = state;
    this.message = message;
    Services.obs.notifyObservers(null, STATE_TOPIC, state);
  },

  init() {
    if (this._started) {
      return;
    }
    this._started = true;
    if (!this.supported) {
      this._set("unsupported", "Updates aren't set up for this build.");
      return;
    }
    Services.obs.addObserver(this, "quit-application");
    this._recoverStaged();
    lazy.setTimeout(() => this.maybeCheck(), FIRST_CHECK_DELAY_MS);
    this._timer = lazy.setInterval(() => this.maybeCheck(), CHECK_EVERY_MS);
  },

  // An update downloaded in an earlier session that never got installed.
  _recoverStaged() {
    try {
      let marker = updatesDir();
      marker.append("staged.json");
      if (!marker.exists()) {
        return;
      }
      let staged = JSON.parse(readTextFile(marker));
      let app = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      app.initWithPath(staged.path);
      if (compareVersions(staged.version, this.currentVersion) > 0 && app.exists()) {
        this.staged = staged;
        this.available = { version: staged.version };
        this._set("ready", `Version ${staged.version} installs when you quit.`);
        return;
      }
      this._cleanup();
    } catch (e) {
      console.warn("Act: ignoring a broken staged update", e);
      this._cleanup();
    }
  },

  async maybeCheck() {
    if (!ActPrefs.updateEnabled || this.state == "ready") {
      return;
    }
    let last = Services.prefs.getIntPref(PREF.updateLastCheck, 0);
    let now = Math.floor(Date.now() / 1000);
    if (now - last < ActPrefs.updateIntervalHours * 3600) {
      return;
    }
    await this.check();
  },

  /**
   * Looks for a newer release and, if there is one, downloads and stages it.
   */
  async check() {
    if (!this.supported || ["checking", "downloading"].includes(this.state)) {
      return;
    }
    if (this.state == "ready") {
      return;
    }
    let { repo, platform, publicKey } = this.info;
    this._set("checking", "Checking for updates…");
    try {
      // act.update.url points somewhere else for testing, normally empty.
      let url =
        Services.prefs.getStringPref("act.update.url", "") ||
        `https://api.github.com/repos/${repo}/releases/latest`;
      let response = await fetch(url, {
        headers: { accept: "application/vnd.github+json" },
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`GitHub said ${response.status}`);
      }
      let release = await response.json();
      setActPref(PREF.updateLastCheck, Math.floor(Date.now() / 1000));

      let version = String(release.tag_name || "").replace(/^v/, "");
      if (!version || compareVersions(version, this.currentVersion) <= 0) {
        this._set("up-to-date", `Act Browser ${this.currentVersion} is up to date.`);
        return;
      }

      let ext = platform.startsWith("linux") ? "tar.xz" : "zip";
      let name = `Act-Browser-${version}-${platform}.${ext}`;
      let asset = release.assets?.find(a => a.name == name);
      let sigAsset = release.assets?.find(a => a.name == `${name}.sig`);
      if (!asset || !sigAsset) {
        throw new Error(`Release ${version} has no ${name} (with signature)`);
      }
      if (!installDir().parent.isWritable()) {
        throw new Error(
          `Version ${version} is out, but ${installDir().parent.path} isn't ` +
            "writable. Download it from GitHub instead."
        );
      }

      this.available = { version, notes: release.html_url };
      this._set("downloading", `Downloading Act Browser ${version}…`);
      await this._download(asset.browser_download_url, sigAsset.browser_download_url, {
        name,
        version,
        platform,
        publicKey,
      });
    } catch (e) {
      console.error("Act: update failed", e);
      this._set("error", e.message || String(e));
    }
  },

  async _download(url, sigUrl, { name, version, platform, publicKey }) {
    let dir = updatesDir();
    this._cleanup();
    dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

    let archive = dir.clone();
    archive.append(name);
    await lazy.Downloads.fetch(url, archive.path);

    let sigResponse = await fetch(sigUrl, { credentials: "omit" });
    if (!sigResponse.ok) {
      throw new Error("Couldn't download the update signature");
    }
    let signature = await sigResponse.text();
    let sha256 = sha256File(archive.path);
    let valid = await verifySignature(
      publicKey,
      signedMessage(platform, version, sha256),
      signature
    );
    if (!valid) {
      throw new Error("The update's signature doesn't match, not installing it");
    }

    let staging = dir.clone();
    staging.append("staged");
    staging.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
    if (platform == "mac") {
      await run("/usr/bin/ditto", ["-x", "-k", archive.path, staging.path]);
      // Downloads get the quarantine flag, which would make macOS refuse to
      // open the (ad hoc signed) app.
      await run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", staging.path]).catch(
        () => {}
      );
    } else if (isWindows()) {
      // Windows 10 and later come with bsdtar, which reads zips.
      await run(system32("tar.exe"), ["-xf", archive.path, "-C", staging.path]);
    } else {
      await run("/usr/bin/env", ["tar", "-xJf", archive.path, "-C", staging.path]);
    }
    archive.remove(false);

    // The .app (macOS) or act-browser folder (Linux, Windows) inside the
    // archive, whatever the user named their copy.
    let app = [...staging.directoryEntries].find(entry =>
      platform == "mac" ? entry.leafName.endsWith(".app") : entry.leafName == "act-browser"
    );
    if (!app) {
      throw new Error("The update didn't contain the app");
    }

    this.staged = { version, path: app.path };
    let marker = dir.clone();
    marker.append("staged.json");
    writeTextFile(marker, JSON.stringify(this.staged));

    this._set("ready", `Version ${version} installs when you quit.`);
  },

  /**
   * Quits, installs the staged update and starts the new version.
   */
  restartToUpdate() {
    if (!this.staged) {
      return;
    }
    this._restartAfterInstall = true;
    let cancel = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
    Services.obs.notifyObservers(cancel, "quit-application-requested", "restart");
    if (cancel.data) {
      this._restartAfterInstall = false;
      return;
    }
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
  },

  observe(_subject, topic) {
    if (topic == "quit-application" && this.staged) {
      try {
        this._launchInstaller(this._restartAfterInstall);
      } catch (e) {
        console.error("Act: couldn't start the update installer", e);
      }
    }
  },

  // Starts a little script that outlives us: it waits for this process to
  // exit, swaps the app and optionally starts it again. If the swap fails
  // the old app is put back.
  _launchInstaller(relaunch) {
    if (isWindows()) {
      this._launchWindowsInstaller(relaunch);
      return;
    }
    let target = installDir();
    let script = updatesDir();
    script.append("install.sh");
    let quote = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
    let launch = isMac()
      ? `/usr/bin/open ${quote(target.path)}`
      : `${quote(target.path + "/act-browser")} >/dev/null 2>&1 &`;
    let body = [
      "#!/bin/sh",
      `pid=${Services.appinfo.processID}`,
      `target=${quote(target.path)}`,
      `staged=${quote(this.staged.path)}`,
      `updates=${quote(updatesDir().path)}`,
      'while kill -0 "$pid" 2>/dev/null; do sleep 0.3; done',
      'backup="$target.old"',
      'rm -rf "$backup"',
      'if mv "$target" "$backup" && mv "$staged" "$target"; then',
      '  rm -rf "$backup" "$updates"',
      "else",
      '  [ -e "$backup" ] && [ ! -e "$target" ] && mv "$backup" "$target"',
      "fi",
      relaunch ? launch : "",
      "",
    ].join("\n");

    writeTextFile(script, body, 0o755);

    let sh = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    sh.initWithPath("/bin/sh");
    let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    process.init(sh);
    // nohup + & so the script survives us exiting.
    let args = ["-c", `nohup /bin/sh ${quote(script.path)} >/dev/null 2>&1 &`];
    process.run(false, args, args.length);
  },

  // The same with PowerShell. Also carries the uninstaller (unins000.*,
  // from the Setup.exe install) over to the new folder, so "Uninstall"
  // keeps working after updates.
  _launchWindowsInstaller(relaunch) {
    let target = installDir();
    let script = updatesDir();
    script.append("install.ps1");
    let quote = s => `'${String(s).replace(/'/g, "''")}'`;
    let body = [
      `$target = ${quote(target.path)}`,
      `$staged = ${quote(this.staged.path)}`,
      `$updates = ${quote(updatesDir().path)}`,
      `Wait-Process -Id ${Services.appinfo.processID} -ErrorAction SilentlyContinue`,
      "Start-Sleep -Milliseconds 500",
      '$backup = "$target.old"',
      "Remove-Item -Recurse -Force $backup -ErrorAction SilentlyContinue",
      'Copy-Item (Join-Path $target "unins*") $staged -ErrorAction SilentlyContinue',
      "try {",
      "  Move-Item $target $backup -ErrorAction Stop",
      "  Move-Item $staged $target -ErrorAction Stop",
      "  Remove-Item -Recurse -Force $backup, $updates -ErrorAction SilentlyContinue",
      "} catch {",
      "  if (!(Test-Path $target) -and (Test-Path $backup)) { Move-Item $backup $target }",
      "}",
      relaunch ? 'Start-Process (Join-Path $target "firefox.exe")' : "",
      "",
    ].join("\r\n");
    writeTextFile(script, body);

    let powershell = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    powershell.initWithPath(system32("WindowsPowerShell", "v1.0", "powershell.exe"));
    let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    process.init(powershell);
    process.startHidden = true;
    let args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-File",
      script.path,
    ];
    process.run(false, args, args.length);
  },

  _cleanup() {
    try {
      let dir = updatesDir();
      if (dir.exists()) {
        dir.remove(true);
      }
    } catch (e) {
      console.warn("Act: couldn't clean up old updates", e);
    }
  },

  STATE_TOPIC,
};
