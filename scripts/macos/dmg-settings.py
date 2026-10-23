# dmgbuild settings for the Act Browser disk image: the app on the left, an
# Applications shortcut on the right, and a background telling you to drag
# one onto the other. Used by scripts/package.mjs:
#
#   dmgbuild -s dmg-settings.py -D app=... -D background=... -D icon=... "Act Browser" out.dmg

import os.path

application = defines["app"]  # noqa: F821 (provided by dmgbuild)
app_name = os.path.basename(application)

format = "UDZO"
filesystem = "HFS+"
size = None

files = [application]
symlinks = {"Applications": "/Applications"}
icon = defines.get("icon")  # noqa: F821

background = defines["background"]  # noqa: F821
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
default_view = "icon-view"

# The window is the background's size (660x400) plus the title bar.
window_rect = ((200, 140), (660, 422))
icon_size = 128
text_size = 13
icon_locations = {
    app_name: (180, 190),
    "Applications": (480, 190),
}
