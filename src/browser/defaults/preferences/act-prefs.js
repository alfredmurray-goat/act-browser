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
// Look up what you can do on the site you're visiting (booking, pricing...).
// Only the domain is sent, never the full URL. Skipped in private windows.
pref("act.actuent.siteActions", true);

pref("act.compactMode", false);
// Address bar and buttons on top of the tab sidebar, like Zen.
pref("act.layout.sidebarToolbar", true);
// Extension buttons in a row at the bottom of the tab sidebar.
pref("act.extensions.inSidebar", true);
// The Act start page for new tabs (and the home page).
pref("act.newtab.enabled", true);

pref("act.workspaces.enabled", true);
pref("act.workspaces.list", "[{\"id\":\"home\",\"name\":\"Home\",\"icon\":\"🏠\"}]");

// --- Firefox defaults we change ----------------------------------------------

// Tabs live on the left.
pref("sidebar.revamp", true);
pref("sidebar.verticalTabs", true);
pref("sidebar.position_start", true);
pref("sidebar.visibility", "always-show");
pref("sidebar.main.tools", "history,bookmarks");

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

// No sponsored stuff on the new tab page.
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
