#![cfg_attr(test, allow(dead_code, unused_imports))]

use crate::workspace::CommandError;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowCaptionButtonRect {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
    pub(crate) scale_factor: f64,
}

#[cfg(all(windows, not(test)))]
mod platform {
    use super::{CommandError, WindowCaptionButtonRect};
    use std::{
        collections::HashMap,
        sync::{Mutex, OnceLock},
    };
    use tauri::{AppHandle, Emitter, Manager, State, Window};
    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        Graphics::Gdi::{GetStockObject, HBRUSH, NULL_BRUSH},
        System::LibraryLoader::GetModuleHandleW,
        UI::{
            Input::KeyboardAndMouse::{TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT},
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DestroyWindow, LoadCursorW, RegisterClassExW,
                SetCursor, SetWindowPos, CS_HREDRAW, CS_VREDRAW, HCURSOR, HTMAXBUTTON, HWND_TOP,
                IDC_HAND, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_SHOWWINDOW, WM_NCHITTEST,
                WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE, WM_NCMOUSEMOVE, WM_SETCURSOR,
                WNDCLASSEXW, WS_CHILD, WS_CLIPSIBLINGS, WS_OVERLAPPED, WS_VISIBLE,
            },
        },
    };

    const SNAP_CLASS: &[u16] = &[67, 104, 101, 109, 100, 83, 110, 97, 112, 0];
    const EVENT_ENTER: &str = "chemd-window-snap-button-enter";
    const EVENT_LEAVE: &str = "chemd-window-snap-button-leave";
    const EVENT_CLICK: &str = "chemd-window-snap-button-click";

    #[derive(Clone, Default)]
    pub(crate) struct WindowsSnapLayoutState;

    struct PhysicalRect {
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    }

    struct SnapState {
        overlay: isize,
        hovered: bool,
        pressed: bool,
        app: AppHandle,
        label: String,
    }

    unsafe impl Send for SnapState {}

    #[tauri::command]
    pub(crate) fn set_window_maximize_button_rect(
        window: Window,
        _state: State<'_, WindowsSnapLayoutState>,
        rect: Option<WindowCaptionButtonRect>,
    ) -> Result<(), CommandError> {
        let hwnd = window.hwnd().map_err(|error| {
            CommandError::new(
                "snap_layout_hwnd_unavailable",
                "native window handle is unavailable",
                Some(error.to_string()),
            )
        })?;
        let hwnd = hwnd.0 as isize;
        let app = window.app_handle().clone();
        let label = window.label().to_string();

        let _ = window.run_on_main_thread(move || unsafe {
            let hwnd = hwnd as HWND;
            match rect.and_then(to_physical_rect) {
                Some(rect) => install_or_update(hwnd, rect, app, label),
                None => remove(hwnd),
            }
        });
        Ok(())
    }

    unsafe fn install_or_update(hwnd: HWND, rect: PhysicalRect, app: AppHandle, label: String) {
        register_class();
        let key = hwnd_key(hwnd);
        let existing = snap_states().lock().ok().and_then(|mut states| {
            let state = states.get_mut(&key)?;
            state.app = app.clone();
            state.label = label.clone();
            Some(state.overlay as HWND)
        });
        if let Some(overlay) = existing {
            position_overlay(overlay, rect);
            return;
        }

        let overlay = CreateWindowExW(
            0,
            SNAP_CLASS.as_ptr(),
            SNAP_CLASS.as_ptr(),
            WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_OVERLAPPED,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            hwnd,
            std::ptr::null_mut(),
            GetModuleHandleW(std::ptr::null()),
            std::ptr::null_mut(),
        );
        if overlay.is_null() {
            return;
        }

        if let Ok(mut states) = snap_states().lock() {
            states.insert(
                key,
                SnapState {
                    overlay: hwnd_key(overlay),
                    hovered: false,
                    pressed: false,
                    app,
                    label,
                },
            );
        }
        position_overlay(overlay, rect);
    }

    unsafe fn remove(hwnd: HWND) {
        let overlay = snap_states()
            .lock()
            .ok()
            .and_then(|mut states| states.remove(&hwnd_key(hwnd)))
            .map(|state| state.overlay as HWND);
        if let Some(overlay) = overlay {
            DestroyWindow(overlay);
        }
    }

    unsafe fn position_overlay(overlay: HWND, rect: PhysicalRect) {
        SetWindowPos(
            overlay,
            HWND_TOP,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }

    unsafe extern "system" fn overlay_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_SETCURSOR => {
                SetCursor(hand_cursor());
                return 1;
            }
            WM_NCHITTEST => return HTMAXBUTTON as LRESULT,
            WM_NCMOUSEMOVE => {
                set_hovered(hwnd, true);
                track_leave(hwnd);
                return 0;
            }
            WM_NCMOUSELEAVE => {
                set_hovered(hwnd, false);
                set_pressed(hwnd, false);
                return 0;
            }
            WM_NCLBUTTONDOWN => {
                set_hovered(hwnd, true);
                set_pressed(hwnd, true);
                return 0;
            }
            WM_NCLBUTTONUP => {
                if take_pressed(hwnd) {
                    emit(hwnd, EVENT_CLICK);
                }
                return 0;
            }
            _ => {}
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    fn set_hovered(overlay: HWND, hovered: bool) {
        update(overlay, |state| {
            if state.hovered == hovered {
                return None;
            }
            state.hovered = hovered;
            Some(if hovered { EVENT_ENTER } else { EVENT_LEAVE })
        });
    }

    fn set_pressed(overlay: HWND, pressed: bool) {
        update(overlay, |state| {
            state.pressed = pressed;
            None
        });
    }

    fn take_pressed(overlay: HWND) -> bool {
        let mut pressed = false;
        update(overlay, |state| {
            pressed = state.pressed;
            state.pressed = false;
            None
        });
        pressed
    }

    fn update(overlay: HWND, f: impl FnOnce(&mut SnapState) -> Option<&'static str>) {
        let event = snap_states().lock().ok().and_then(|mut states| {
            let state = find_by_overlay(&mut states, overlay)?;
            let event = f(state)?;
            Some((state.app.clone(), state.label.clone(), event))
        });
        if let Some((app, label, event)) = event {
            let _ = app.emit_to(label, event, ());
        }
    }

    fn emit(overlay: HWND, event: &'static str) {
        let target = snap_states().lock().ok().and_then(|mut states| {
            let state = find_by_overlay(&mut states, overlay)?;
            Some((state.app.clone(), state.label.clone()))
        });
        if let Some((app, label)) = target {
            let _ = app.emit_to(label, event, ());
        }
    }

    fn find_by_overlay(
        states: &mut HashMap<isize, SnapState>,
        overlay: HWND,
    ) -> Option<&mut SnapState> {
        let key = hwnd_key(overlay);
        states.values_mut().find(|state| state.overlay == key)
    }

    fn to_physical_rect(rect: WindowCaptionButtonRect) -> Option<PhysicalRect> {
        if rect.width <= 0.0 || rect.height <= 0.0 || rect.scale_factor <= 0.0 {
            return None;
        }
        Some(PhysicalRect {
            x: scale(rect.x, rect.scale_factor),
            y: scale(rect.y, rect.scale_factor),
            width: scale(rect.width, rect.scale_factor).max(1),
            height: scale(rect.height, rect.scale_factor).max(1),
        })
    }

    unsafe fn register_class() {
        static REGISTERED: OnceLock<()> = OnceLock::new();
        REGISTERED.get_or_init(|| {
            let class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(overlay_proc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: GetModuleHandleW(std::ptr::null()),
                hIcon: std::ptr::null_mut(),
                hCursor: hand_cursor(),
                hbrBackground: GetStockObject(NULL_BRUSH) as HBRUSH,
                lpszMenuName: std::ptr::null(),
                lpszClassName: SNAP_CLASS.as_ptr(),
                hIconSm: std::ptr::null_mut(),
            };
            RegisterClassExW(&class);
        });
    }

    unsafe fn track_leave(hwnd: HWND) {
        let mut event = TRACKMOUSEEVENT {
            cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
            dwFlags: TME_LEAVE | TME_NONCLIENT,
            hwndTrack: hwnd,
            dwHoverTime: 0,
        };
        TrackMouseEvent(&mut event);
    }

    fn scale(value: f64, scale_factor: f64) -> i32 {
        (value * scale_factor).round() as i32
    }

    fn hwnd_key(hwnd: HWND) -> isize {
        hwnd as isize
    }

    fn hand_cursor() -> HCURSOR {
        static CURSOR: OnceLock<isize> = OnceLock::new();
        *CURSOR.get_or_init(|| unsafe { LoadCursorW(std::ptr::null_mut(), IDC_HAND) as isize })
            as HCURSOR
    }

    fn snap_states() -> &'static Mutex<HashMap<isize, SnapState>> {
        static STATES: OnceLock<Mutex<HashMap<isize, SnapState>>> = OnceLock::new();
        STATES.get_or_init(|| Mutex::new(HashMap::new()))
    }
}

#[cfg(all(not(windows), not(test)))]
#[derive(Clone, Default)]
pub(crate) struct WindowsSnapLayoutState;

#[cfg(all(not(windows), not(test)))]
#[tauri::command]
pub(crate) fn set_window_maximize_button_rect(
    _window: tauri::Window,
    _state: tauri::State<'_, WindowsSnapLayoutState>,
    _rect: Option<WindowCaptionButtonRect>,
) -> Result<(), CommandError> {
    Ok(())
}

#[cfg(all(windows, not(test)))]
pub(crate) use platform::{set_window_maximize_button_rect, WindowsSnapLayoutState};
