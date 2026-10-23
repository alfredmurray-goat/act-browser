# Contributing

Thanks for taking a look! A few things that make life easier.

## Setup

```sh
npm run dev
```

That's it. No dependencies to install. See the README for the other scripts.

The Browser Toolbox is the best debugging tool you have: enable
`devtools.chrome.enabled` and `devtools.debugger.remote-enabled` in
`about:config`, then press <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Shift</kbd>
<kbd>I</kbd> (<kbd>Cmd</kbd> <kbd>Opt</kbd> <kbd>Shift</kbd> <kbd>I</kbd> on
macOS). `ActBrowser`, `ActPopup`, `ActWorkspaces` etc. are globals in every
browser window.

## Code style

- Follow the Firefox style: 2 spaces, double quotes, `let` over `const`
  unless it's a real constant, braces on every `if`.
- Every file starts with the MPL header.
- Anything that comes from the network is untrusted. The popup and the new
  tab page run with chrome privileges, so build DOM with `textContent` and
  `createElement`, never `innerHTML`, and only open `http(s)` links.
- Every feature has to respect its pref. If `act.actuent.enabled` is off,
  nothing talks to Actuent.
- Prefer Firefox's own pieces (vertical tabs, `hideTab`, CustomizableUI
  areas, the urlbar provider API) over reimplementing them. It keeps upgrades cheap.

Run `npm run lint` before sending a PR.

## Updating Firefox

1. Bump `firefox.version` in `act.config.json`.
2. `npm run dev -- --rebuild`
3. Click through the Act popup, the new tab page, workspaces, compact mode,
   the ⚡ button, the extensions row and the address bar, and keep an eye on
   the browser console. The Firefox internals we rely on are imported at the
   top of each module, so that's where to look when something breaks.
