import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const MODES = ['blocklist', 'allowlist'];

// GLib >= 2.80 moved DesktopAppInfo to GioUnix; fall back to Gio for older versions.
const DesktopAppInfo = (await import('gi://GioUnix').catch(() => null))?.default?.DesktopAppInfo ?? Gio.DesktopAppInfo;

function lookupApp(id) {
    for (const candidate of [id, `${id}.desktop`]) {
        try {
            const info = DesktopAppInfo.new(candidate);
            if (info)
                return info;
        } catch {
            // Not a valid desktop file id.
        }
    }
    // Fall back to matching the WM_CLASS against StartupWMClass / desktop id.
    const lower = id.toLowerCase();
    return Gio.AppInfo.get_all().find(info =>
        info.get_startup_wm_class?.()?.toLowerCase() === lower ||
        info.get_id()?.toLowerCase().replace(/\.desktop$/, '') === lower) ?? null;
}

function appIcon(info) {
    const image = new Gtk.Image({pixel_size: 32});
    const icon = info?.get_icon();
    if (icon)
        image.set_from_gicon(icon);
    else
        image.set_from_icon_name('application-x-executable-symbolic');
    return image;
}

function appRow(id, info) {
    const row = new Adw.ActionRow({
        title: GLib.markup_escape_text(info?.get_display_name() ?? id, -1),
        subtitle: info ? GLib.markup_escape_text(id, -1) : _('No matching application found (matched against WM_CLASS)'),
    });
    row.add_prefix(appIcon(info));
    return row;
}

export default class WindowIsReadyFilterPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(640, 720);

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-notifications-symbolic',
        });
        window.add(page);

        // Mode
        const modeGroup = new Adw.PreferencesGroup({
            title: _('“Window is ready” notifications'),
            description: _('Choose which applications may still show the “… is ready” notification.'),
        });
        page.add(modeGroup);

        const modeRow = new Adw.ComboRow({
            title: _('Suppress For'),
            model: Gtk.StringList.new([
                _('Listed apps only'),
                _('All apps except listed'),
            ]),
            selected: MODES.indexOf(settings.get_string('mode')),
        });
        modeRow.connect('notify::selected', () => settings.set_string('mode', MODES[modeRow.selected]));
        modeGroup.add(modeRow);

        // Configured applications
        const appsGroup = new Adw.PreferencesGroup();
        page.add(appsGroup);

        const addButton = new Gtk.Button({
            child: new Adw.ButtonContent({icon_name: 'list-add-symbolic', label: _('Add App…')}),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        addButton.connect('clicked', () => this._showAppChooser(window, id => addApp(id)));
        appsGroup.set_header_suffix(addButton);

        const manualRow = new Adw.EntryRow({
            title: _('Add by app ID or WM_CLASS (e.g. google-chrome or terminator)'),
            show_apply_button: true,
        });
        manualRow.connect('apply', () => {
            const id = manualRow.text.trim();
            if (id)
                addApp(id);
            manualRow.text = '';
        });

        // Recently seen
        const recentGroup = new Adw.PreferencesGroup({
            title: _('Recently Requested Attention'),
            description: _('Apps that recently triggered a “Window is ready” request, so you can add them with one click.'),
        });
        page.add(recentGroup);

        const clearButton = new Gtk.Button({
            label: _('Clear'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        clearButton.connect('clicked', () => settings.set_strv('recent-apps', []));
        recentGroup.set_header_suffix(clearButton);

        const normalize = id => id.toLowerCase().replace(/\.desktop$/, '');
        const hasApp = id => settings.get_strv('apps').some(a => normalize(a) === normalize(id));
        const addApp = id => {
            if (!hasApp(id))
                settings.set_strv('apps', [...settings.get_strv('apps'), id]);
        };
        const removeApp = id => settings.set_strv('apps', settings.get_strv('apps').filter(a => a !== id));

        let appRows = [];
        const rebuildApps = () => {
            appRows.forEach(row => appsGroup.remove(row));
            appRows = [];

            const allowlist = settings.get_string('mode') === 'allowlist';
            appsGroup.title = allowlist ? _('Keep Notifications For') : _('Suppress Notifications For');

            const apps = settings.get_strv('apps');
            for (const id of apps) {
                const row = appRow(id, lookupApp(id));
                const remove = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    tooltip_text: _('Remove'),
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                });
                remove.connect('clicked', () => removeApp(id));
                row.add_suffix(remove);
                appRows.push(row);
            }
            if (apps.length === 0)
                appRows.push(new Adw.ActionRow({title: _('No applications added yet'), css_classes: ['dim-label']}));
            appRows.push(manualRow);
            appRows.forEach(row => appsGroup.add(row));
        };

        let recentRows = [];
        const rebuildRecent = () => {
            recentRows.forEach(row => recentGroup.remove(row));
            recentRows = [];

            const recent = settings.get_strv('recent-apps');
            for (const id of recent) {
                const row = appRow(id, lookupApp(id));
                const added = hasApp(id);
                const add = new Gtk.Button({
                    icon_name: added ? 'object-select-symbolic' : 'list-add-symbolic',
                    tooltip_text: added ? _('Already in list') : _('Add to list'),
                    sensitive: !added,
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                });
                add.connect('clicked', () => addApp(id));
                row.add_suffix(add);
                recentRows.push(row);
            }
            if (recent.length === 0)
                recentRows.push(new Adw.ActionRow({title: _('Nothing seen yet'), css_classes: ['dim-label']}));
            recentRows.forEach(row => recentGroup.add(row));
            clearButton.sensitive = recent.length > 0;
        };

        const handlerIds = [
            settings.connect('changed::apps', () => {
                rebuildApps();
                rebuildRecent();
            }),
            settings.connect('changed::mode', rebuildApps),
            settings.connect('changed::recent-apps', rebuildRecent),
        ];
        window.connect('close-request', () => {
            handlerIds.forEach(id => settings.disconnect(id));
            return false;
        });
        rebuildApps();
        rebuildRecent();
    }

    _showAppChooser(parent, onSelected) {
        const dialog = new Adw.Dialog({
            title: _('Add Application'),
            content_width: 420,
            content_height: 560,
        });

        const search = new Gtk.SearchEntry({
            placeholder_text: _('Search applications'),
            hexpand: true,
        });
        const header = new Adw.HeaderBar({title_widget: search});

        const list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            valign: Gtk.Align.START,
        });

        const apps = Gio.AppInfo.get_all()
            .filter(info => info.should_show() && info.get_id())
            .sort((a, b) => a.get_display_name().localeCompare(b.get_display_name()));

        for (const info of apps) {
            const row = appRow(info.get_id(), info);
            row.activatable = true;
            row._searchText = `${info.get_display_name()} ${info.get_id()}`.toLowerCase();
            row.connect('activated', () => {
                onSelected(info.get_id());
                dialog.close();
            });
            list.append(row);
        }

        list.set_filter_func(row => row._searchText.includes(search.text.toLowerCase()));
        search.connect('search-changed', () => list.invalidate_filter());
        search.connect('activate', () => {
            let row = list.get_first_child();
            while (row && !row.get_child_visible())
                row = row.get_next_sibling();
            row?.emit('activated');
        });

        const toolbar = new Adw.ToolbarView({
            content: new Gtk.ScrolledWindow({
                child: list,
                hscrollbar_policy: Gtk.PolicyType.NEVER,
                vexpand: true,
            }),
        });
        toolbar.add_top_bar(header);
        dialog.set_child(toolbar);
        dialog.present(parent);
        search.grab_focus();
    }
}
