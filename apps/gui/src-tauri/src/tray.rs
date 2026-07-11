// tray.rs — System tray icon, context menu, and click handlers.
// Extracted from lib.rs for maintainability.

use crate::services::power;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

/// Create the system tray icon with a context menu.
///
/// Menu items:
/// - **Show Window** — bring the main window to the front.
/// - **Hide** — send the main window to the tray.
/// - **Quit** — exit the application.
///
/// Left-clicking the tray icon toggles window visibility.
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide to Tray", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let _tray = TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .ok_or("No default window icon configured")?
                .clone(),
        )
        .tooltip("Motrix AI")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                // Release the power inhibitor synchronously before exit.
                // app.exit(0) terminates the tokio runtime immediately, so
                // an async allow_sleep() call would never complete. Linux's
                // systemd-inhibit child would otherwise linger as a zombie
                // holding an idle-sleep lock until the next reboot.
                power::release_inhibitor_blocking();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
