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
macOS). `ActBrowser`, `ActPanel`, `ActWorkspaces` etc. are globals in every
browser window.

## Code style

- Follow the Firefox style: 2 spaces, double quotes, `let` over `const`
  unless it's a real constant, braces on every `if`.
- Every file starts with the MPL header.
- Anything that comes from the network or a model is untrusted. The panel
  runs with chrome privileges, so build DOM with `textContent` and
  `createElement`, never `innerHTML`, and only open `http(s)` links.
- Every feature has to respect its pref. If `act.ai.enabled` or
  `act.actuent.enabled` is off, the feature makes no network requests.
- Prefer Firefox's own pieces (vertical tabs, `hideTab`, `PageExtractor`,
  the urlbar provider API) over reimplementing them. It keeps upgrades cheap.

Run `npm run lint` before sending a PR.

## Updating Firefox

1. Bump `firefox.version` in `act.config.json`.
2. `npm run dev -- --rebuild`
3. Click through the panel, workspaces, compact mode, the ⚡ button and the
   address bar. Internal Firefox APIs we use are listed at the top of each
   module, check the browser console for errors.
