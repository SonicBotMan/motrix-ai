// services/mod.rs — Module registry for backend service modules.
//
// These modules provide background functionality that is exposed to the
// frontend via Tauri commands but is not user-facing IPC in the same way
// as the `commands` modules.

pub mod power;
