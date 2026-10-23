// Downloads the Firefox release Act Browser is built on (see act.config.json)
// and unpacks it into .cache/. Safe to run again, it skips what's there.

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  CACHE,
  firefox,
  isMac,
  isMain,
  isWindows,
  log,
  platform,
  requirePlatform,
  rm,
  run,
} from "./lib.mjs";

export async function fetchFirefox() {
  requirePlatform();
  fs.mkdirSync(CACHE, { recursive: true });

  if (fs.existsSync(firefox.extracted)) {
    return firefox.extracted;
  }

  if (!fs.existsSync(firefox.archive)) {
    log(`Downloading Firefox ${firefox.version} (${platform})…`);
    let response = await fetch(firefox.downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${firefox.downloadUrl}`);
    }
    let partial = `${firefox.archive}.part`;
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
    fs.renameSync(partial, firefox.archive);
  }

  log("Unpacking…");
  let target = path.dirname(firefox.extracted);
  rm(target);
  fs.mkdirSync(target, { recursive: true });

  if (isMac) {
    let mount = path.join(CACHE, "mnt");
    rm(mount);
    run("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, firefox.archive], {
      quiet: true,
    });
    try {
      run("ditto", [path.join(mount, "Firefox.app"), firefox.extracted]);
    } finally {
      run("hdiutil", ["detach", mount, "-quiet"]);
    }
  } else if (isWindows) {
    // Gives core/ (the browser) next to the installer's own setup.exe.
    run("7z", ["x", "-y", `-o${target}`, firefox.archive], { quiet: true });
  } else {
    run("tar", ["-xJf", firefox.archive, "-C", target]);
  }

  return firefox.extracted;
}

if (isMain(import.meta.url)) {
  fetchFirefox()
    .then(dir => log(`Firefox is ready in ${path.relative(process.cwd(), dir)}`))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
