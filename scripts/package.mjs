// Builds Act Browser and makes the downloads for this platform, in dist/:
//
//   macOS    Act-Browser-<v>-mac.dmg              drag to Applications
//            Act-Browser-<v>-mac.zip (+ .sig)      for the built-in updater
//   Windows  Act-Browser-<v>-win64-setup.exe      installer
//            Act-Browser-<v>-win64.zip (+ .sig)    for the built-in updater
//   Linux    act-browser_<v>_amd64.deb            Debian, Ubuntu...
//            Act-Browser-<v>-linux-x86_64.tar.xz (+ .sig)
//                                                 everything else, and the updater
//
// Update archives get a .sig: an Ed25519 signature made with the private
// update key (see scripts/keygen.mjs). The key comes from the ACT_UPDATE_KEY
// environment variable (the release workflow) or
// ~/.config/act-browser/update-key.pem.
//
// Needs, besides Node: dmgbuild on macOS (pip install dmgbuild, otherwise
// you get a plain disk image), 7-Zip and Inno Setup on Windows, dpkg-deb on
// Linux for the .deb.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build, desktopEntry } from "./build.mjs";
import {
  BRANDING,
  DIST,
  ROOT,
  config,
  isLinux,
  isMac,
  isWindows,
  log,
  platform,
  rm,
  run,
} from "./lib.mjs";

const KEY_FILE = path.join(os.homedir(), ".config", "act-browser", "update-key.pem");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;

function updateKey() {
  if (process.env.ACT_UPDATE_KEY) {
    return process.env.ACT_UPDATE_KEY;
  }
  return fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : null;
}

// Must match signedMessage() in src/act/modules/ActUpdater.sys.mjs.
function signedMessage(sha256) {
  return `act-browser-update:${platform}:${version}:${sha256}`;
}

function sign(file) {
  let key = updateKey();
  if (!key) {
    log(
      "No update key, so no .sig: the built-in updater won't install this. " +
        "Run `npm run keygen` once."
    );
    return;
  }
  let sha256 = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  let signature = crypto.sign(null, Buffer.from(signedMessage(sha256)), key);
  fs.writeFileSync(`${file}.sig`, signature.toString("base64") + "\n");
  log(`Signed ${path.basename(file)}`);
}

function hasCommand(cmd, args = ["--version"]) {
  let result = spawnSync(cmd, args, { stdio: "ignore" });
  return !result.error;
}

// --- macOS -----------------------------------------------------------------------

function packageMac(layout, base) {
  let dmg = `${base}.dmg`;
  rm(dmg);
  let hasDmgbuild = !spawnSync("python3", ["-c", "import dmgbuild"], { stdio: "ignore" }).status;
  if (hasDmgbuild) {
    log("Creating disk image…");
    run("python3", [
      "-m",
      "dmgbuild",
      "-s",
      path.join(ROOT, "scripts", "macos", "dmg-settings.py"),
      "-D",
      `app=${layout.app}`,
      "-D",
      `background=${path.join(BRANDING, "icons", "dmg-background.tiff")}`,
      "-D",
      `icon=${path.join(BRANDING, "icons", "act.icns")}`,
      config.name,
      dmg,
    ]);
  } else {
    log("dmgbuild isn't installed (pip install dmgbuild), making a plain disk image.");
    let stage = fs.mkdtempSync(path.join(os.tmpdir(), "act-dmg-"));
    try {
      run("cp", ["-cR", layout.app, stage]);
      fs.symlinkSync("/Applications", path.join(stage, "Applications"));
      run("hdiutil", ["create", "-volname", config.name, "-srcfolder", stage, "-ov", "-format", "UDZO", dmg]);
    } finally {
      rm(stage);
    }
  }

  log("Creating update archive…");
  let zip = `${base}.zip`;
  rm(zip);
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", layout.app, zip]);
  sign(zip);
}

// --- Windows ---------------------------------------------------------------------

function isccPath() {
  for (let candidate of [
    "ISCC.exe",
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
  ]) {
    if (hasCommand(candidate, ["/?"])) {
      return candidate;
    }
  }
  return null;
}

function packageWindows(layout, base) {
  log("Creating update archive…");
  // The zip holds the act-browser folder itself, like the Linux tarball.
  let zip = `${base}.zip`;
  rm(zip);
  run("7z", ["a", "-tzip", "-mx=9", zip, path.basename(layout.app)], {
    cwd: path.dirname(layout.app),
    quiet: true,
  });
  sign(zip);

  let iscc = isccPath();
  if (!iscc) {
    log("Inno Setup isn't installed, skipping the installer.");
    return;
  }
  log("Creating installer…");
  run(iscc, [
    `/DAppVersion=${version}`,
    `/DRepo=${config.updates?.repo || ""}`,
    `/DSourceDir=${layout.app}`,
    `/DOutputDir=${DIST}`,
    `/DOutputName=${path.basename(base)}-setup`,
    `/DIconFile=${path.join(layout.app, "act.ico")}`,
    path.join(ROOT, "scripts", "windows", "act-browser.iss"),
  ]);
}

// --- Linux -----------------------------------------------------------------------

function packageLinux(layout, base) {
  let tarball = `${base}.tar.xz`;
  rm(tarball);
  run("tar", ["-cJf", tarball, "-C", path.dirname(layout.app), path.basename(layout.app)]);
  sign(tarball);

  if (!hasCommand("dpkg-deb")) {
    log("dpkg-deb isn't installed, skipping the .deb.");
    return;
  }
  log("Creating .deb…");
  let arch = platform == "linux-aarch64" ? "arm64" : "amd64";
  let root = fs.mkdtempSync(path.join(os.tmpdir(), "act-deb-"));
  try {
    fs.mkdirSync(path.join(root, "opt"));
    run("cp", ["-a", layout.app, path.join(root, "opt", "act-browser")]);

    fs.mkdirSync(path.join(root, "usr", "bin"), { recursive: true });
    fs.symlinkSync("/opt/act-browser/act-browser", path.join(root, "usr", "bin", "act-browser"));

    let apps = path.join(root, "usr", "share", "applications");
    fs.mkdirSync(apps, { recursive: true });
    fs.writeFileSync(path.join(apps, "act-browser.desktop"), desktopEntry("act-browser"));
    for (let size of [16, 32, 48, 64, 128, 256]) {
      let dir = path.join(root, "usr", "share", "icons", "hicolor", `${size}x${size}`, "apps");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(BRANDING, "icons", `icon${size}.png`), path.join(dir, "act-browser.png"));
    }

    let installedKb = Math.round(
      Number(run("du", ["-sk", root], { quiet: true }).split(/\s/)[0]) || 0
    );
    fs.mkdirSync(path.join(root, "DEBIAN"));
    fs.writeFileSync(
      path.join(root, "DEBIAN", "control"),
      [
        "Package: act-browser",
        `Version: ${version}`,
        "Section: web",
        "Priority: optional",
        `Architecture: ${arch}`,
        `Installed-Size: ${installedKb}`,
        "Depends: libgtk-3-0 | libgtk-3-0t64, libasound2 | libasound2t64, libx11-xcb1",
        `Maintainer: Act Browser <https://github.com/${config.updates?.repo || ""}>`,
        `Homepage: https://github.com/${config.updates?.repo || ""}`,
        `Description: ${pkg.description}`,
        " Act Browser is built on Firefox, with tabs, workspaces and extensions",
        " in a sidebar and live web results from Actuent.",
        "",
      ].join("\n")
    );
    run("dpkg-deb", [
      "--build",
      "--root-owner-group",
      root,
      path.join(DIST, `act-browser_${version}_${arch}.deb`),
    ]);
  } finally {
    rm(root);
  }
}

// --- Main ------------------------------------------------------------------------

if (!config.updates?.publicKey) {
  log("act.config.json has no updates.publicKey, this build won't update itself.");
}

let layout = await build();
let base = path.join(DIST, `Act-Browser-${version}-${platform}`);

if (isMac) {
  packageMac(layout, base);
} else if (isWindows) {
  packageWindows(layout, base);
} else if (isLinux) {
  packageLinux(layout, base);
}

log(`Done: ${path.relative(process.cwd(), DIST)}`);
