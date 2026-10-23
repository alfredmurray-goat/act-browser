// Shared bits for the build scripts. No dependencies, just Node.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CACHE = path.join(ROOT, ".cache");
export const DIST = path.join(ROOT, "dist");
export const SRC = path.join(ROOT, "src");
export const BRANDING = path.join(ROOT, "branding");

export const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, "act.config.json"), "utf8")
);

export const platform = (() => {
  if (process.platform == "darwin") {
    return "mac";
  }
  if (process.platform == "linux") {
    return process.arch == "arm64" ? "linux-aarch64" : "linux-x86_64";
  }
  if (process.platform == "win32" && process.arch == "x64") {
    return "win64";
  }
  return null;
})();

export const isMac = platform == "mac";
export const isWindows = platform == "win64";
export const isLinux = !!platform?.startsWith("linux");

export function requirePlatform() {
  if (!platform) {
    fail(
      `Building on ${process.platform}/${process.arch} isn't supported ` +
        "(macOS, Linux and 64 bit Windows are)."
    );
  }
}

// True when the calling module was run directly with `node script.mjs`.
export function isMain(moduleUrl) {
  return !!process.argv[1] && pathToFileURL(process.argv[1]).href == moduleUrl;
}

export function log(...args) {
  console.log("\x1b[35m[act]\x1b[0m", ...args);
}

export function fail(message) {
  console.error(`\x1b[31m[act] ${message}\x1b[0m`);
  process.exit(1);
}

/**
 * Runs a command and throws if it fails. `okCodes` lists exit codes that are
 * fine too (unzip likes to exit with 1 or 2 on harmless warnings).
 */
export function run(cmd, args, { cwd, okCodes = [0], quiet = false } = {}) {
  let result = spawnSync(cmd, args, {
    cwd,
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (!okCodes.includes(result.status)) {
    let output = quiet ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}${output}`);
  }
  return result.stdout;
}

export function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

export function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
}

export const firefox = {
  get version() {
    return config.firefox.version;
  },

  get downloadUrl() {
    let { version, locale } = config.firefox;
    let base = `https://download-installer.cdn.mozilla.net/pub/firefox/releases/${version}`;
    if (isMac) {
      return `${base}/mac/${locale}/Firefox%20${version}.dmg`;
    }
    if (isWindows) {
      // Only the installer is published, a self extracting 7-Zip archive.
      return `${base}/win64/${locale}/Firefox%20Setup%20${version}.exe`;
    }
    return `${base}/${platform}/${locale}/firefox-${version}.tar.xz`;
  },

  get archive() {
    let ext = isMac ? "dmg" : isWindows ? "exe" : "tar.xz";
    return path.join(CACHE, `firefox-${this.version}-${platform}.${ext}`);
  },

  // Where the untouched, extracted Firefox lives.
  get extracted() {
    let dir = path.join(CACHE, `firefox-${this.version}-${platform}`);
    return path.join(dir, isMac ? "Firefox.app" : isWindows ? "core" : "firefox");
  },
};

// zip and unzip, with 7-Zip on Windows where those don't exist.
export function unzipTo(archive, dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (isWindows) {
    run("7z", ["x", "-y", `-o${dir}`, archive], { quiet: true });
  } else {
    // omni.ja has a slightly unusual header, unzip warns about it (exit 1/2).
    run("unzip", ["-q", "-o", archive, "-d", dir], { okCodes: [0, 1, 2], quiet: true });
  }
}

// Zips the *contents* of dir (not dir itself) into archive.
export function zipContents(dir, archive) {
  rm(archive);
  if (isWindows) {
    run("7z", ["a", "-tzip", "-mx=9", archive, "."], { cwd: dir, quiet: true });
  } else {
    run("zip", ["-q", "-r", "-9", "-X", "-D", archive, "."], { cwd: dir });
  }
}

/**
 * Layout of a built Act Browser for the current platform.
 */
export function appLayout(outDir = DIST) {
  if (platform == "mac") {
    let app = path.join(outDir, `${config.name}.app`);
    return {
      app,
      resources: path.join(app, "Contents", "Resources"),
      binary: path.join(app, "Contents", "MacOS", "firefox"),
    };
  }
  let app = path.join(outDir, "act-browser");
  return {
    app,
    resources: app,
    binary: path.join(app, isWindows ? "firefox.exe" : "firefox"),
  };
}
