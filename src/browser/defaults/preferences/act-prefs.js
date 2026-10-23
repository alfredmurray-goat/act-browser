// Act Browser defaults. Everything here can be changed in about:config,
// most of it also from the Act panel settings.

// --- Act features -----------------------------------------------------------

// Master switches. Turning one off removes the UI and stops all network
// requests for that feature.
pref("act.ai.enabled", true);
pref("act.actuent.enabled", true);

// AI provider. Groq speaks the OpenAI chat completions API, so any
// compatible endpoint (a local llama.cpp or Ollama server, etc.) works too.
pref("act.ai.endpoint", "https://api.groq.com/openai/v1");
pref("act.ai.model", "openai/gpt-oss-120b");
pref("act.ai.temperature", "0.4");
// Let the assistant read the page you're on when you ask about it.
pref("act.ai.pageContext", true);

// Actuent (https://actuent.ai) - live, structured info about the web.
pref("act.actuent.endpoint", "https://api.actuent.ai");
pref("act.actuent.urlbar", true);
pref("act.actuent.urlbar.maxResults", 3);
// Look up what you can do on the site you're visiting (booking, pricing...).
// Only the domain is sent, never the full URL. Skipped in private windows.
pref("act.actuent.siteActions", true);

pref("act.compactMode", false);
pref("act.panel.width", 380);
pref("act.panel.open", false);

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

// We ship our own assistant, so hide Firefox's chatbot sidebar by default.
pref("browser.ml.chat.enabled", false);

// No sponsored stuff on the new tab page.
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
