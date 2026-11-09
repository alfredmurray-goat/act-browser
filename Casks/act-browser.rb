cask "act-browser" do
  version :latest
  sha256 :no_check

  url "https://github.com/alfredmurray-goat/act-browser/releases/latest/download/Act-Browser-mac.dmg"
  name "Act Browser"
  desc "Firefox-based browser with vertical tabs, workspaces and Actuent search"
  homepage "https://github.com/alfredmurray-goat/act-browser"

  app "Act Browser.app"

  caveats <<~EOS
    Act Browser is not notarized by Apple yet. Homebrew downloads it without
    the quarantine flag, so it opens normally, and `brew reinstall --cask
    act-browser` updates it without the "unidentified developer" block.
  EOS
end
