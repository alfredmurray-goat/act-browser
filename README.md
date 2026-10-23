<p align="center">
  <img src="branding/logo.png" width="96" alt="Act Browser logo">
</p>

<h1 align="center">Act Browser</h1>

<p align="center">
  A calm, Firefox based browser with everything in the sidebar, workspaces,
  the live web built in through Actuent, and room for your AI agents to
  drive it.
</p>

---

Act Browser takes the official Firefox release and reshapes it, in the
spirit of [Zen](https://zen-browser.app): a see-through sidebar that runs
the full height of the window, holding your tabs, workspaces, downloads and
extensions, with the page floating next to it. On top of
that it builds in [Actuent](https://actuent.ai), which turns websites into
structured data: what a site is, what you can do there, opening hours,
prices, events. That's where the name comes from. **Act**uent, and the
browser should help you *act* on a page, not just read it.

## Install

Grab the latest from the [releases page](https://github.com/alfredmurray-goat/act-browser/releases/latest):

| | Download | |
| --- | --- | --- |
| **macOS** | `Act-Browser-…-mac.dmg` | Open it and drag Act Browser to Applications |
| **Windows** | `Act-Browser-…-win64-setup.exe` | Installs for your user, no admin needed |
| **Linux** | `act-browser_…_amd64.deb` | `sudo apt install ./act-browser_…_amd64.deb` |
| | `Act-Browser-…-linux-x86_64.tar.xz` | Unpack anywhere and run `act-browser/act-browser` |

After that it updates itself (the `.deb` installs into `/opt`, which it
can't write to; install the next `.deb` instead, or use the tarball).

The first time you open it:

- **macOS** says it can't check the app for malware, because it isn't
  notarized with an Apple developer account. Open *System Settings ›
  Privacy & Security*, scroll down and click *Open Anyway*. Only needed
  once.
- **Windows** SmartScreen may say it "protected your PC". Click *More info ›
  Run anyway*. Same reason: no paid code signing certificate yet.

## Features

**Layout**

- Tabs on the left, using Firefox's own vertical tabs, so everything that
  works with Firefox keeps working.
- The sidebar goes all the way to the top of the window, window buttons
  included, and on macOS it's translucent like Zen. The toolbar sits above
  the page. Prefer the address bar inside the sidebar? There's a switch.
- Compact mode slides the whole sidebar away. Move the mouse to the left
  edge, or start typing an address, to bring it back.
- Workspaces: separate sets of tabs in one window. Pinned tabs are shared
  between all of them. Right click a tab to move it, right click a workspace
  to rename it or change its icon.
- Settings, saved sites, history and downloads along the bottom of the
  sidebar, with your extensions' icons stacked up the right hand side
  instead of behind the puzzle piece menu. Popups and badges work as usual.
- uBlock Origin comes preinstalled. It's a normal add-on, you can remove it.
- Upload from the clipboard, like Opera: when a site asks for a file and you
  have an image copied, a small menu offers to upload that instead.

**Actuent**

- **Start page.** New tabs open an Act page with one search box: your
  search engine, with Actuent's live results (places, prices, events) right
  in its suggestions. Below it, sites you've saved and the ones you visit
  most, and the weather from [Rejn](https://rejn.app) in the corner
  (instead of Firefox's AccuWeather widget). Closing the last tab leaves you
  on this page instead of closing the window.
- **Address bar suggestions.** Type `coffee near nørreport` or
  `notion pricing` and matching places and sites show up next to your
  history.
- **Site actions.** A ⚡ button in the address bar lights up when the site
  you're on has known actions (book a table, see pricing, contact...). It
  uses the site's own `/.well-known/lawp.json` when there is one and
  Actuent's index otherwise.
- **Explore.** The Act button opens a quick search with filters for places
  that are open now, and news.
- Select text, right click, *Look up on Actuent*.

**AI agents**

Claude Code, Codex, Cursor or anything else that speaks
[MCP](https://modelcontextprotocol.io) can drive Act Browser: open pages,
read them, click, type, scroll and take screenshots. While an agent works you
see its cursor glide over the page with its name next to it.

1. Click the Act button, the gear, and turn on **Let AI agents control the
   browser**.
2. Click **Copy Claude Code setup** (or Codex) and paste the command in a
   terminal. It looks like this:

   ```sh
   claude mcp add act-browser -- node "/Applications/Act Browser.app/Contents/Resources/agent/act-mcp.mjs"
   codex mcp add act-browser -- node "/Applications/Act Browser.app/Contents/Resources/agent/act-mcp.mjs"
   ```

3. The first time an agent connects, Act Browser asks you to allow it. Tick
   *remember* to let agents in until the next restart.

Several agents can share the browser, they take turns. The server is a
single file with no dependencies, it needs Node 22 or newer. It uses
Firefox's built-in WebDriver BiDi on `localhost:9222`, nothing leaves your
machine.

**Updates**

Act Browser updates itself from this repo's GitHub releases. A few hours
apart it checks for a newer version, downloads it in the background, checks
its signature and installs it when you quit (or right away with *Restart
now*). The Act button gets a dot while an update is waiting. You can check
by hand, or turn it off, in Act settings.

**Embedding**

Sites can't block being shown in another site's iframe: Act Browser ignores
`X-Frame-Options` and CSP `frame-ancestors` for framed pages. Firefox keeps
a framed site's cookies apart from the real one, so the framed copy isn't
logged in as you. Switch it off in settings (*Let sites show any site in a
frame*) for stock Firefox behaviour.

### Keyboard shortcuts

| Shortcut | What it does |
| --- | --- |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>E</kbd> | Explore (Actuent search) |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>C</kbd> | Compact mode |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>←</kbd> / <kbd>→</kbd> | Previous / next workspace |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>1</kbd>…<kbd>9</kbd> | Jump to a workspace |

## Settings

Click the Act button, then the gear. Everything is also a normal pref in
`about:config`:

| Pref | Default | |
| --- | --- | --- |
| `act.actuent.enabled` | `true` | Everything Actuent. Off means no requests at all |
| `act.actuent.urlbar` | `true` | Address bar suggestions |
| `act.actuent.siteActions` | `true` | The ⚡ button |
| `act.newtab.enabled` | `true` | The Act start page |
| `act.layout.sidebarToolbar` | `false` | Address bar inside the sidebar instead of above the page |
| `act.upload.clipboard` | `true` | Offer the clipboard image when a site asks for a file |
| `act.weather.enabled` | `true` | Rejn weather on the new tab page |
| `act.weather.lat` / `lon` / `location` | Copenhagen | The place to show |
| `act.weather.useMyLocation` | `false` | Use the browser's location instead (Rejn asks for permission) |
| `act.weather.units` | `metric` | Or `imperial` |
| `act.agents.enabled` | `false` | Let AI agents control the browser |
| `act.framing.allowAll` | `true` | Ignore sites' "don't embed me" rules |
| `act.update.enabled` | `true` | Update automatically from GitHub releases |
| `act.extensions.inSidebar` | `true` | Extension buttons in the sidebar |
| `act.workspaces.enabled` | `true` | Workspaces |
| `act.compactMode` | `false` | Compact mode |

Firefox's own AI features (chatbot sidebar, link previews, smart window
agents) are switched off by default.

### Privacy

- Nothing typed in a private window goes to Actuent, same as Firefox's own
  search suggestions.
- Site actions sends the **domain** you're on (`notion.com`), never the full
  address. It's skipped in private windows and for local or IP addresses.
- The new tab page runs as ordinary sandboxed web content, not with browser
  privileges, and gets the few things it needs (Actuent results, top sites,
  the search engine) through a small bridge. The Rejn weather widget sits in
  its own isolated iframe.
- Agent control is off until you turn it on, and every new connection has
  to be approved in the browser.
- Firefox telemetry, studies and the update service are disabled through
  `distribution/policies.json`.

## Getting it running

You need Node 20 or newer, on macOS, Linux or 64 bit Windows. For the
installers: `pip install dmgbuild` on macOS (for the styled disk image),
7-Zip and Inno Setup on Windows, `dpkg-deb` on Linux. The release workflow
installs these itself.

```sh
npm run dev
```

The first run downloads Firefox (the version is pinned in
`act.config.json`) and uBlock Origin, builds a dev copy into `.cache/dev`
and starts it with its own profile. After that, changes under `src/act/`
only need a browser restart.

```sh
npm run dev -- --fresh      # start over with an empty profile
npm run dev -- --rebuild    # after changing branding, extensions or the Firefox version
npm run build               # dist/Act Browser.app (or dist/act-browser on Linux)
npm run package             # the downloads for this platform, in dist/
npm run smoke               # start the packaged build and check it works
npm run lint                # make sure every JS file parses
```

## Releasing

Releases are built by GitHub Actions (`.github/workflows/release.yml`) and
every installed copy picks them up.

One time only:

```sh
npm run keygen                                   # update signing key
gh secret set ACT_UPDATE_KEY < ~/.config/act-browser/update-key.pem
```

`keygen` puts the private key in `~/.config/act-browser/` (never commit it,
and don't lose it: builds out there only accept updates signed with it) and
its public half in `act.config.json`.

Each release:

```sh
npm version 0.4.0 --no-git-tag-version
git commit -am "Act Browser 0.4.0"
git tag v0.4.0 && git push && git push --tags
```

The workflow builds macOS, Windows and Linux, starts each build to check it,
signs the update archives and publishes the release with all the downloads.
Pull requests get the same builds and checks, without the release.

## How it works

Act Browser isn't a source fork. Building Firefox from source takes hours and
around 40 GB, and keeping a fork in sync with Mozilla every four weeks is a
lot of work. Instead, the build:

1. downloads the official, signed Firefox release,
2. drops in an [autoconfig](https://support.mozilla.org/kb/customizing-firefox-using-autoconfig)
   file (`src/act.cfg`) that loads our code at startup with full browser
   privileges,
3. replaces the branding inside `browser/omni.ja`, the app name and the icon,
4. adds `policies.json`, our default prefs and the bundled extensions,
5. re-signs the app (ad hoc on macOS),
6. writes `act/build.json` (version, update key) for the updater.

So updating to a new Firefox is mostly bumping the version in
`act.config.json` and checking nothing broke.

```
src/
├── act.cfg                         bootstrap, runs at startup
├── defaults/pref/autoconfig.js     points Firefox at act.cfg
├── browser/defaults/preferences/   our default prefs
├── distribution/policies.json      no updates, no telemetry
└── act/
    ├── chrome.manifest             chrome://act/content/ and resource://act/
    ├── modules/                    shared code, one copy per session
    │   ├── ActStartup.sys.mjs      hooks into every browser window
    │   ├── ActPrefs.sys.mjs
    │   ├── Actuent.sys.mjs         Actuent API client + LAWP lookups
    │   ├── ActUrlbar.sys.mjs       address bar provider
    │   ├── ActExtensions.sys.mjs   the downloads + extensions row
    │   ├── ActAgents.sys.mjs       starts the agent server on demand
    │   ├── ActUpdater.sys.mjs      self-updates from GitHub releases
    │   ├── ActFraming.sys.mjs      lets any site be framed
    │   └── actors/                 new tab bridge, upload from clipboard
    └── content/
        ├── browser/                scripts + CSS loaded into each window
        ├── popup/                  the Act button's popup (Explore, Settings)
        ├── newtab/                 the start page (served as resource://act-page/,
        │                           runs unprivileged)
        ├── shared/                 result rendering, the Rejn weather widget, styles
        └── icons/

agent/act-mcp.mjs                   the MCP server for AI agents
branding/                           logo, icons, brand names
```

The files in `content/browser/` are loaded into the browser window the same
way Firefox loads its own `browser-*.js` scripts, so they can use `gBrowser`,
`SessionStore`, `CustomizableUI` and friends directly.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Mozilla Public License 2.0](LICENSE), same as Firefox. uBlock Origin is
GPLv3 and downloaded unmodified from addons.mozilla.org, its source is at
[github.com/gorhill/uBlock](https://github.com/gorhill/uBlock).

Firefox is a trademark of the Mozilla Foundation. Act Browser is not made or
endorsed by Mozilla, which is also why it ships with its own name and logo.
