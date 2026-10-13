/** @file Contains the implementation of the preferences page. */

import type Adw from 'gi://Adw';

import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {prefsTabs} from './preferences/index.js';
import {logDebug} from './utils/log.js';
import {initPrefs, uninitPrefs} from './utils/settings.js';

export default class RoundedWindowCornersRebornPrefs extends ExtensionPreferences {
    //
    // NOTE: Adw.PreferencesWindow and win.add(page) are marked deprecated in
    // the Adw types in favor of Adw.PreferencesDialog, but the Shell prefs
    // host still passes a PreferencesWindow subclass on both GNOME 50 and 51
    // (js/dbusServices/extensions/extensionPrefsDialog.js upstream), so this
    // signature must stay. If upstream ever migrates the host to a Dialog,
    // switch the parameter type and the 'close-request' handler below to the
    // Dialog 'closed' signal.
    // biome-ignore lint/suspicious/useAwait: ExtensionPreferences requires this to be async
    async fillPreferencesWindow(win: Adw.PreferencesWindow) {
        initPrefs(this.getSettings());

        for (const page of prefsTabs) {
            win.add(new page());
        }

        // Disconnect all signals when closing the preferences
        win.connect('close-request', () => {
            logDebug('Disconnect Signals');
            uninitPrefs();
        });

        this.#loadCss();
    }

    #loadCss() {
        const display = Gdk.Display.get_default();
        if (display) {
            const css = new Gtk.CssProvider();
            const path = GLib.build_filenamev([
                import.meta.url,
                'stylesheet-prefs.css',
            ]);
            css.load_from_path(path);
            Gtk.StyleContext.add_provider_for_display(display, css, 0);
        }
    }
}
