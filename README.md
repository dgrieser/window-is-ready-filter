# Window Is Ready Filter

GNOME Shell extension that suppresses the **“… is ready”** notification
(`window-demands-attention` / `window-marked-urgent`) **per application** —
e.g. only for Chrome, Files (Nautilus) or your terminal — while keeping it for
everything else.

Inspired by [WindowIsReady_Remover](https://github.com/nunofarruca/WindowIsReady_Remover),
which removes the notification for all apps.

## Features

- **Blocklist mode**: suppress the notification only for the listed apps (default).
- **Allowlist mode**: suppress it for all apps except the listed ones.
- Preferences UI with:
  - searchable app picker for installed applications,
  - manual entry by desktop app ID or `WM_CLASS` (for apps without a `.desktop` file),
  - a list of apps that recently requested attention, to add them with one click.

Apps are matched (case-insensitive, `.desktop` suffix optional) against the
desktop app ID, the window's `WM_CLASS` and its `WM_CLASS` instance.

## Install

```sh
make install
gnome-extensions enable window-is-ready-filter@david-grieser.de
```

On Wayland, log out and back in after the first install. Open the settings with:

```sh
gnome-extensions prefs window-is-ready-filter@david-grieser.de
```

Other targets: `make package` (builds a zip in `build/`), `make enable`, `make disable`.

## How it works

On enable, GNOME Shell's `WindowAttentionHandler` is disconnected from the
display's attention signals and replaced by a filter that forwards to the
original handler only for apps that are not suppressed. On disable, the original
handler is reconnected, restoring stock behavior.

Supports GNOME Shell 46–50.
