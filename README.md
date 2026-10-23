<p align="center">
  <img src="branding/logo.png" width="96" alt="Act Browser logo">
</p>

<h1 align="center">Act Browser</h1>

<p align="center">
  A calm, Firefox based browser with tabs on the side, workspaces, and an
  assistant that knows what's happening on the web right now.
</p>

---

Act Browser takes the official Firefox release and reshapes it. It's in the
spirit of [Zen](https://zen-browser.app): vertical tabs, content floating in
the window, a compact mode that gets out of your way. On top of that it adds
two things, both of which you can switch off:

- **An AI assistant** in a side panel, running on [Groq](https://groq.com)
  (or any OpenAI compatible endpoint, including local models).
- **[Actuent](https://actuent.ai)**, which turns websites into structured
  data: what a site is, what you can do there, opening hours, prices, events.
  That's where the name comes from. **Act**uent, and the browser should help
  you *act* on a page, not just read it.

## Features

**Browsing**

- Tabs on the left, using Firefox's own vertical tabs, so extensions and
  everything else keep working.
- Workspaces: separate sets of tabs in one window. Pinned tabs are shared
  between all of them. Right click a tab to move it, right click a workspace
  to rename it or change its icon.
- Compact mode hides the toolbar until you move the mouse to the top, and
  collapses the tab bar to icons.
- Floating, rounded content area. One color for all the chrome around it.

**Actuent**

- **Address bar suggestions.** Type `coffee near nørreport` or
  `notion pricing` and matching places and sites show up next to your
  history.
- **Site actions.** A ⚡ button in the address bar lights up when the site
  you're on has known actions (book a table, see pricing, contact...). It
  uses the site's own `/.well-known/lawp.json` when there is one and
  Actuent's index otherwise.
- **Explore.** A search view in the panel for places (with *open now*),
  products with prices, events, and news.

**Assistant**

- Chat in the side panel, streamed.
- It can search Actuent, read the page you're on, look at your tabs and open
  links. It can't type into pages, click or submit anything, so a page that
  tries to give it instructions can't do much harm.
- Right click selected text to ask about it or look it up. Right click a page
  to summarize it.
- Your API key is stored in the Firefox password manager, not in a config
  file.

### Keyboard shortcuts

| Shortcut | What it does |
| --- | --- |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>A</kbd> | Open or close the Act panel |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>E</kbd> | Explore (Actuent search) |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>C</kbd> | Compact mode |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>←</kbd> / <kbd>→</kbd> | Previous / next workspace |
| <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>1</kbd>…<kbd>9</kbd> | Jump to a workspace |

## Turning things off

Open the Act panel and click the gear. **AI assistant** and **Actuent live
web** each have a master switch. With one off, its buttons, menus and
network requests are gone, not just hidden. Everything is also a normal pref
in `about:config` under `act.`:

| Pref | Default | |
| --- | --- | --- |
| `act.ai.enabled` | `true` | The assistant |
| `act.ai.endpoint` | `https://api.groq.com/openai/v1` | Any OpenAI compatible API |
| `act.ai.model` | `openai/gpt-oss-120b` | Pick from the list in settings |
| `act.ai.pageContext` | `true` | Allow reading the current page |
| `act.actuent.enabled` | `true` | Everything Actuent |
| `act.actuent.urlbar` | `true` | Address bar suggestions |
| `act.actuent.siteActions` | `true` | The ⚡ button |
| `act.workspaces.enabled` | `true` | Workspaces |
| `act.compactMode` | `false` | Compact mode |

### Privacy

- Nothing typed in a private window goes to Actuent, same as Firefox's own
  search suggestions.
- Site actions sends the **domain** you're on (`notion.com`), never the full
  address. It's skipped in private windows and for local or IP addresses.
- The assistant only sees a page when it decides to read it, and you can turn
  that off.
- Firefox telemetry, studies and the update service are disabled through
  `distribution/policies.json`.

## Getting it running

You need Node 20 or newer, and macOS or Linux. Windows isn't wired up yet,
help welcome.

```sh
npm run dev
```

The first run downloads Firefox (the version is pinned in
`act.config.json`), builds a dev copy into `.cache/dev` and starts it with
its own profile. After that, changes under `src/act/` only need a browser
restart.

```sh
npm run dev -- --fresh      # start over with an empty profile
npm run dev -- --rebuild    # after changing branding or the Firefox version
npm run build               # dist/Act Browser.app (or dist/act-browser on Linux)
npm run package             # .dmg / .tar.xz for releases
npm run lint                # make sure every JS file parses
```

To try the assistant, get a free key at
[console.groq.com/keys](https://console.groq.com/keys) and paste it into
settings. During development you can also start with
`GROQ_API_KEY=... npm run dev`.

## How it works

Act Browser isn't a source fork. Building Firefox from source takes hours and
around 40 GB, and keeping a fork in sync with Mozilla every four weeks is a
lot of work. Instead, the build:

1. downloads the official, signed Firefox release,
2. drops in an [autoconfig](https://support.mozilla.org/kb/customizing-firefox-using-autoconfig)
   file (`src/act.cfg`) that loads our code at startup with full browser
   privileges,
3. replaces the branding inside `browser/omni.ja`, the app name and the icon,
4. adds `policies.json` and our default prefs,
5. re-signs the app (ad hoc on macOS).

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
    │   ├── ActAI.sys.mjs           Groq / OpenAI compatible streaming client
    │   ├── ActAssistant.sys.mjs    tools and the chat loop
    │   └── ActUrlbar.sys.mjs       address bar provider
    └── content/
        ├── browser/                scripts + CSS loaded into each window
        ├── panel/                  the side panel (Ask, Explore, Settings)
        └── icons/
```

The files in `content/browser/` are loaded into the browser window the same
way Firefox loads its own `browser-*.js` scripts, so they can use `gBrowser`,
`SessionStore` and friends directly.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Mozilla Public License 2.0](LICENSE), same as Firefox.

Firefox is a trademark of the Mozilla Foundation. Act Browser is not made or
endorsed by Mozilla, which is also why it ships with its own name and logo.
