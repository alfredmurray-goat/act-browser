// Starts the built Act Browser (dist/) headless and checks that the Act
// parts are really there: branding, the sidebar, the updater, the start page
// and its bridge, bundled extensions. CI runs it on every platform after
// `npm run package`.
//
//   node scripts/smoke.mjs

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT, appLayout, fail, log, rm } from "./lib.mjs";

const PORT = 2828;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

// Just enough of the Marionette protocol for this.
class Marionette {
  static connect() {
    return new Promise((resolve, reject) => {
      let socket = net.connect(PORT, "127.0.0.1");
      socket.once("error", reject);
      let client = new Marionette(socket);
      client.next = resolve.bind(null, client);
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.waiting = [];
    this.id = 0;
    socket.on("data", data => this.onData(data));
  }

  onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    for (;;) {
      let colon = this.buffer.indexOf(":");
      if (colon < 0) {
        return;
      }
      let length = parseInt(this.buffer.subarray(0, colon).toString());
      if (this.buffer.length < colon + 1 + length) {
        return;
      }
      let message = JSON.parse(this.buffer.subarray(colon + 1, colon + 1 + length).toString());
      this.buffer = this.buffer.subarray(colon + 1 + length);
      if (this.next) {
        // The server greets us first.
        let next = this.next;
        this.next = null;
        next();
      } else {
        this.waiting.shift()?.(message);
      }
    }
  }

  async send(name, params = {}) {
    let reply = await new Promise(resolve => {
      this.waiting.push(resolve);
      let body = JSON.stringify([0, ++this.id, name, params]);
      this.socket.write(`${Buffer.byteLength(body)}:${body}`);
    });
    if (reply[2]) {
      throw new Error(`${name}: ${reply[2].message || JSON.stringify(reply[2])}`);
    }
    return reply[3];
  }

  async run(script) {
    let result = await this.send("WebDriver:ExecuteAsyncScript", {
      script: `let done = arguments[arguments.length - 1];
        (async () => { ${script} })().then(done, e => done({ error: String(e) }));`,
      args: [],
    });
    return result.value;
  }
}

async function connectWithRetry(child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode != null) {
      throw new Error(`The browser exited early (${child.exitCode})`);
    }
    try {
      return await Marionette.connect();
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("The browser didn't start within 2 minutes");
}

let { binary } = appLayout();
if (!fs.existsSync(binary)) {
  fail(`No build at ${binary}, run npm run package first.`);
}

let profile = fs.mkdtempSync(path.join(os.tmpdir(), "act-smoke-"));
log(`Starting ${binary}…`);
let child = spawn(
  binary,
  ["-profile", profile, "-no-remote", "--headless", "--marionette", "--remote-allow-system-access"],
  { stdio: "ignore", env: { ...process.env, MOZ_CRASHREPORTER_DISABLE: "1" } }
);

let failures = [];
let client;
try {
  client = await connectWithRetry(child);
  await client.send("WebDriver:NewSession", { capabilities: {} });
  await client.send("Marionette:SetContext", { value: "chrome" });
  await client.send("WebDriver:SetTimeouts", { script: 120000 });

  let report = await client.run(`
    // Give the window and the first run (extensions install) a moment.
    for (let i = 0; i < 60 && typeof ActBrowser == "undefined"; i++) {
      await new Promise(r => setTimeout(r, 500));
    }
    await new Promise(r => setTimeout(r, 8000));
    let { ActUpdater } = ChromeUtils.importESModule("resource://act/ActUpdater.sys.mjs");
    let { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    let addons = (await AddonManager.getAddonsByTypes(["extension"]))
      .filter(a => !a.isBuiltin && !a.isSystem)
      .map(a => a.id);

    BrowserCommands.openTab();
    let page = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      let spec = gBrowser.selectedBrowser.documentURI?.spec;
      if (spec && spec != "about:blank") {
        page = spec;
        break;
      }
    }
    let bridge = false;
    try {
      bridge = !!gBrowser.selectedBrowser.browsingContext.currentWindowGlobal.getActor("ActNewTab");
    } catch {}

    // A private window gets the badge at the top of its sidebar.
    let privateWin = OpenBrowserWindow({ private: true });
    await new Promise(r => privateWin.addEventListener("load", r, { once: true }));
    let privateBadge = false;
    for (let i = 0; i < 40 && !privateBadge; i++) {
      await new Promise(r => setTimeout(r, 250));
      privateBadge = !!privateWin.document.getElementById("act-private-badge");
    }
    privateWin.close();

    let brand = Services.strings
      .createBundle("chrome://branding/locale/brand.properties")
      .GetStringFromName("brandShortName");
    return {
      act: typeof ActBrowser == "object",
      brand,
      verticalTabs: Services.prefs.getBoolPref("sidebar.verticalTabs"),
      footer: !!document.getElementById("act-sidebar-footer"),
      actButton: !!document.getElementById("act-button"),
      privateButton: !!document.getElementById("act-tool-private"),
      normalBadge: !!document.getElementById("act-private-badge"),
      privateBadge,
      version: ActUpdater.currentVersion,
      updaterReady: ActUpdater.supported,
      newTabPage: page,
      bridge,
      addons,
    };
  `);
  log(JSON.stringify(report, null, 2));

  let check = (ok, what) => ok || failures.push(what);
  check(!report?.error, `script error: ${report?.error}`);
  check(report.act, "Act code didn't load");
  check(report.brand == "Act Browser", `branding is "${report.brand}"`);
  check(report.verticalTabs, "tabs aren't on the left");
  check(report.footer, "sidebar footer missing");
  check(report.actButton, "Act toolbar button missing");
  check(report.privateButton, "private window button missing");
  check(!report.normalBadge, "normal window has the private badge");
  check(report.privateBadge, "private window has no private badge");
  check(report.version == pkg.version, `version is ${report.version}, expected ${pkg.version}`);
  check(report.updaterReady, "updater isn't set up (build.json / public key)");
  check(report.newTabPage?.startsWith("resource://act-page/newtab/"), `new tab is ${report.newTabPage}`);
  check(report.bridge, "new tab bridge missing");
  check(report.addons?.includes("uBlock0@raymondhill.net"), "uBlock Origin isn't installed");
  check(
    report.addons?.includes("{446900e4-71c2-419f-a6a7-df9c091e268b}"),
    "Bitwarden isn't installed"
  );
} catch (e) {
  failures.push(e.message);
} finally {
  try {
    await client?.send("Marionette:Quit", { flags: ["eForceQuit"] });
  } catch {}
  setTimeout(() => child.kill(), 5000).unref();
  await new Promise(resolve => child.once("exit", resolve));
  rm(profile);
}

if (failures.length) {
  fail(`Smoke test failed:\n - ${failures.join("\n - ")}`);
}
log("Smoke test passed.");
