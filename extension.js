import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const ATTENTION_SIGNALS = ['window-demands-attention', 'window-marked-urgent'];
const MAX_RECENT_APPS = 15;
const MODE_ALLOWLIST = 1;

function normalize(id) {
    return id.toLowerCase().replace(/\.desktop$/, '');
}

export default class WindowIsReadyFilterExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._tracker = Shell.WindowTracker.get_default();
        this._handler = Main.windowAttentionHandler;

        // Detach GNOME Shell's own handler and route attention requests through our filter.
        global.display.disconnectObject(this._handler);
        for (const signal of ATTENTION_SIGNALS)
            global.display.connectObject(signal, this._onWindowDemandsAttention.bind(this), this);
    }

    disable() {
        global.display.disconnectObject(this);

        // Restore GNOME Shell's handler exactly as WindowAttentionHandler connects it.
        for (const signal of ATTENTION_SIGNALS) {
            global.display.connectObject(
                signal, this._handler._onWindowDemandsAttention.bind(this._handler), this._handler);
        }

        this._handler = null;
        this._tracker = null;
        this._settings = null;
    }

    _onWindowDemandsAttention(display, window) {
        if (!window || window.has_focus() || window.is_skip_taskbar())
            return;

        const ids = this._getWindowIds(window);
        this._rememberRecent(ids[0]);

        if (this._isSuppressed(ids))
            return;

        this._handler._onWindowDemandsAttention(display, window);
    }

    _getWindowIds(window) {
        const ids = [];
        const app = this._tracker.get_window_app(window);
        const appId = app?.get_id();
        // Windows without a .desktop file get a synthetic "window:<n>" id; skip that.
        if (appId && !appId.startsWith('window:'))
            ids.push(appId);
        for (const wmClass of [window.get_wm_class(), window.get_wm_class_instance()]) {
            if (wmClass)
                ids.push(wmClass);
        }
        return ids;
    }

    _isSuppressed(ids) {
        const configured = new Set(this._settings.get_strv('apps').map(normalize));
        const listed = ids.some(id => configured.has(normalize(id)));
        const allowlist = this._settings.get_enum('mode') === MODE_ALLOWLIST;
        return allowlist ? !listed : listed;
    }

    _rememberRecent(id) {
        if (!id)
            return;
        const recent = this._settings.get_strv('recent-apps');
        if (recent[0] === id)
            return;
        const updated = [id, ...recent.filter(r => r !== id)].slice(0, MAX_RECENT_APPS);
        this._settings.set_strv('recent-apps', updated);
    }
}
