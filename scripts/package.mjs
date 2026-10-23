// Builds Act Browser and packs it for distribution, into dist/:
//
//   macOS  Act-Browser-<version>-mac.dmg   for people installing by hand
//          Act-Browser-<version>-mac.zip   what the built-in updater downloads
//   Linux  Act-Browser-<version>-linux-*.tar.xz
//
// Update archives get a .sig next to them: an Ed25519 signature made with
// the private update key (see scripts/keygen.mjs). The key comes from the
// ACT_UPDATE_KEY environment variable (the release workflow) or
// ~/.config/act-browser/update-key.pem.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "./build.mjs";
import { DIST, ROOT, config, log, platform, run } from "./lib.mjs";

const KEY_FILE = path.join(os.homedir(), ".config", "act-browser", "update-key.pem");

function updateKey() {
  if (process.env.ACT_UPDATE_KEY) {
    return process.env.ACT_UPDATE_KEY;
  }
  return fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : null;
}

// Must match signedMessage() in src/act/modules/ActUpdater.sys.mjs.
function signedMessage(version, sha256) {
  return `act-browser-update:${platform}:${version}:${sha256}`;
}

function sign(file, version) {
  let key = updateKey();
  if (!key) {
    log(
      "No update key, so no .sig: the built-in updater won't install this. " +
        "Run `npm run keygen` once."
    );
    return;
  }
  let sha256 = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  let signature = crypto.sign(null, Buffer.from(signedMessage(version, sha256)), key);
  fs.writeFileSync(`${file}.sig`, signature.toString("base64") + "\n");
  log(`Signed ${path.basename(file)}`);
}

let pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
let version = pkg.version;
if (!config.updates?.publicKey) {
  log("act.config.json has no updates.publicKey, this build won't update itself.");
}

let layout = await build();
let base = path.join(DIST, `Act-Browser-${version}-${platform}`);

if (platform == "mac") {
  log("Creating disk image…");
  run("hdiutil", [
    "create",
    "-volname",
    config.name,
    "-srcfolder",
    layout.app,
    "-ov",
    "-format",
    "UDZO",
    `${base}.dmg`,
  ]);
  log("Creating update archive…");
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", layout.app, `${base}.zip`]);
  sign(`${base}.zip`, version);
} else {
  run("tar", ["-cJf", `${base}.tar.xz`, "-C", DIST, path.basename(layout.app)]);
  sign(`${base}.tar.xz`, version);
}

log(`Done: ${path.relative(process.cwd(), DIST)}`);
