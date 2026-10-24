// Act Browser defaults. Everything here can be changed in about:config,
// most of it also from the Act popup settings.

// --- Act features -----------------------------------------------------------

// Master switch. Turning it off removes the UI and stops all network
// requests to Actuent.
pref("act.actuent.enabled", true);

// Actuent (https://actuent.ai) - live, structured info about the web.
pref("act.actuent.endpoint", "https://api.actuent.ai");
pref("act.actuent.urlbar", true);
pref("act.actuent.urlbar.maxResults", 3);
// Actuent in the search engine picker, with its own results page.
pref("act.actuent.searchEngine", true);
// Look up what you can do on the site you're visiting (booking, pricing...).
// Only the domain is sent, never the full URL. Skipped in private windows.
pref("act.actuent.siteActions", true);

pref("act.compactMode", false);
// By default the toolbar sits above the page and the sidebar runs to the top
// of the window. True puts the address bar inside the sidebar instead.
pref("act.layout.sidebarToolbar", false);
// Extension buttons in a row at the bottom of the tab sidebar.
pref("act.extensions.inSidebar", true);
// The Act start page for new tabs (and the home page).
pref("act.newtab.enabled", true);
// Sites saved on the start page, as JSON [{url, title}].
pref("act.newtab.savedSites", "[]");
// Start page wallpaper: glow, aurora, sunset, ocean, forest, graphite, or
// custom (your own picture, kept in the profile as act-wallpaper).
pref("act.newtab.wallpaper", "glow");

// The corner of the sidebar above the bottom row: what's playing, and the
// time with the weather.
pref("act.sidebar.nowPlaying", true);
pref("act.sidebar.glance", true);

// After an update, open a tab with what's new.
pref("act.changelog.enabled", true);

// Weather on the new tab page, from Rejn (https://rejn.app). The place is
// fixed unless useMyLocation is on, then Rejn asks for the browser's
// location. Units: "" picks from the language (°F for en-US), or set
// "metric" / "imperial".
pref("act.weather.enabled", true);
pref("act.weather.useMyLocation", false);
pref("act.weather.lat", "55.6761");
pref("act.weather.lon", "12.5683");
pref("act.weather.location", "Copenhagen");
pref("act.weather.units", "metric");

// When a site asks for a file and there's an image on the clipboard, offer
// to upload that (like Opera).
pref("act.upload.clipboard", true);

// Let AI agents (Claude Code, Codex...) control the browser through
// agent/act-mcp.mjs. Off by default: while on, any program on this computer
// can drive the browser.
pref("act.agents.enabled", false);
pref("act.agents.port", 9222);

// Sites can't stop other sites from showing them in an iframe: we drop
// X-Frame-Options and CSP frame-ancestors from framed responses. Firefox
// keeps framed sites' cookies separate, which limits clickjacking, but set
// this to false to get the stock Firefox behaviour back.
pref("act.framing.allowAll", true);

// Updates come from the project's GitHub releases, see ActUpdater.
pref("act.update.enabled", true);
pref("act.update.intervalHours", 6);

pref("act.workspaces.enabled", true);
pref("act.workspaces.list", "[{\"id\":\"home\",\"name\":\"Home\",\"icon\":\"🏠\"}]");

// --- Firefox defaults we change ----------------------------------------------

// Tabs live on the left.
pref("sidebar.revamp", true);
pref("sidebar.verticalTabs", true);
pref("sidebar.position_start", true);
pref("sidebar.visibility", "always-show");
pref("sidebar.main.tools", "history,bookmarks");

// Downloads sit at the bottom of the sidebar, always visible.
pref("browser.download.autohideButton", false);

// Closing the last tab leaves a new tab instead of closing the window.
pref("browser.tabs.closeWindowWithLastTab", false);

// Keep the chrome quiet.
pref("browser.toolbars.bookmarks.visibility", "never");
pref("browser.tabs.inTitlebar", 1);
pref("browser.compactmode.show", true);
pref("browser.aboutConfig.showWarning", false);
pref("browser.shell.checkDefaultBrowser", false);

// No AI chatbot sidebar, link previews or agent features. (Local ML stays
// on, Firefox's offline translations need it.)
pref("browser.ml.chat.enabled", false);
pref("browser.ml.chat.menu", false);
pref("browser.ml.chat.shortcuts", false);
pref("browser.ml.linkPreview.enabled", false);
pref("browser.smartwindow.agent.enabled", false);
pref("browser.smartwindow.agent.toolbar.enabled", false);
pref("browser.smartwindow.smartformfill.enabled", false);
pref("browser.tabs.groups.smart.enabled", false);

// Firefox's own new tab weather (from AccuWeather) is replaced by Rejn.
pref("browser.newtabpage.activity-stream.showWeather", false);
pref("browser.newtabpage.activity-stream.system.showWeather", false);

// No sponsored stuff on the new tab page.
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);

// Open the tabs from last time when the browser starts.
pref("browser.startup.page", 3);
