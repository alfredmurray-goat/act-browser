// Builds Act Browser and packs it for distribution:
// a .dmg on macOS, a .tar.xz on Linux. Output goes to dist/.

import path from "node:path";
import { build } from "./build.mjs";
import { DIST, config, log, platform, run } from "./lib.mjs";

const pkg = await import("../package.json", { with: { type: "json" } });
const version = pkg.default.version;

let layout = await build();
let base = `Act-Browser-${version}-${platform}`;

if (platform == "mac") {
  let dmg = path.join(DIST, `${base}.dmg`);
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
    dmg,
  ]);
  log(`Done: ${path.relative(process.cwd(), dmg)}`);
} else {
  let tarball = path.join(DIST, `${base}.tar.xz`);
  run("tar", ["-cJf", tarball, "-C", DIST, path.basename(layout.app)]);
  log(`Done: ${path.relative(process.cwd(), tarball)}`);
}
