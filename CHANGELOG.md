# Changelog

What's new in each version of Act Browser. The browser shows this after it
updates (turn that off with `act.changelog.enabled` in about:config).

## 0.6.5

- The downloads button at the bottom of the sidebar opens the downloads panel again.

## 0.6.4

- Passkeys go to Bitwarden. Logged in, Bitwarden answers sites' passkey requests itself. Logged out, the "Touch your security key" box is replaced by one with an Open Bitwarden button (a security key still works from there).

## 0.6.3

- Bitwarden comes pre-installed (from addons.mozilla.org, and you can remove it). It can save and use passkeys, which the Mac's own Touch ID passkeys can't do yet in Act Browser.

## 0.6.2

- Actuent's own logo in the search engine menu, on its results page and in suggestions.
- Actuent is always in the suggestions: "Try this search in Actuent?" in the address bar and on the start page, also when Actuent's live results are busy or find nothing.

## 0.6.1

- Actuent has its logo in the search engine menu.

## 0.6.0

- Actuent is a search engine now. Pick it in the search engine menu in the address bar (or type `@actuent`) and you get Actuent's own results page: places with opening hours, what you can do on each site, products with prices, events with dates.
- Actuent is always in the address bar suggestions: a "Search Actuent" row right away, and the matching sites under it when you stop typing. Before, typing fast used up Actuent's limit and the suggestions disappeared.
- A new look for Explore (the Act button): filters you can tap, site icons, and "See all results" for the full page.
- The start page is tidier: the weather no longer covers the greeting, your sites are one neat row, and sites without an icon get a colored letter.
- Extension popups open next to the sidebar instead of on top of it.
- Downloads now have the same name in every release, so download links always get the newest version.

## 0.5.0

- Your tabs come back. Quit Act Browser and the tabs from last time are there when you open it again.
- History and saved sites open as a small panel above their button, instead of in a side panel.
- The downloads button opens again, and it's back in the bottom row with settings, saved sites and history.
- What's playing, in the corner of the sidebar: the song or video, with play/pause and skip. It shows up while a tab plays something.
- The time, the date and the weather (from Rejn) in the corner of the sidebar.
- Pick a wallpaper for the start page, or use your own picture. Click the brush in the bottom left corner.
- The app icon is the same size as other apps in the Dock on macOS.
- This page: after an update you see what changed.

## 0.4.1

- Passkeys on macOS: sites asking for a passkey no longer hang. Security keys and passkeys from password manager extensions work.

## 0.4.0

- Tab groups, shown as folders in the sidebar. Press Ctrl+Alt+G, or right click under your tabs.
- Downloads for macOS (.dmg), Windows (installer) and Linux (.deb and .tar.xz).
- A new look for uploading from the clipboard.
- Extensions as icons up the right side of the sidebar, with settings, saved sites, history and downloads along the bottom.
- Saved sites on the start page.
- Closing the last tab opens the start page instead of closing the window.

## 0.3.0

- Act Browser updates itself. New versions are checked, downloaded and installed when you restart.
- Sites can be shown inside other sites (embedding protection is off by default, `act.framing.allowAll`).
- A single search box on the start page, with Actuent's results in its suggestions.
