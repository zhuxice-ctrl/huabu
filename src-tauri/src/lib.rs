mod ai;
#[cfg(target_os = "android")]
mod android_ocr;
mod backup;
mod credential_store;
mod device;
mod fonts;
#[cfg(target_os = "ios")]
mod ios_ocr;
mod mcp;
mod mcp_runtime;
mod mobile_system_bars;
mod ocr_packages;
mod printing;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod skill_runtime;
mod skills;

use ai::{
    ai_binary_request, ai_chat_completion_stream, ai_json_request, ai_multipart_request,
    cancel_ai_request, AiRequestManager,
};
use backup::{export_app_data, import_app_data, import_app_data_from_file};
use credential_store::{credential_delete, credential_get, credential_set};
use device::get_device_id;
use fonts::list_system_fonts;
use mcp::{
    send_mcp_message, send_mcp_notification, start_mcp_stdio_server, stop_mcp_server,
    McpServerManager,
};
use mcp_runtime::{
    cancel_mcp_runtime_install, inspect_mcp_runtime, install_mcp_runtime, RuntimeInstallManager,
};
use ocr_packages::{list_ocr_providers, run_ocr_provider};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use skill_runtime::{
    cancel_skill_script, inspect_skill_python, install_skill_python_dependencies, run_skill_script,
    SkillProcessManager,
};
use skills::{import_skill, import_skill_zip, install_skill_package, validate_skill_package};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(McpServerManager::new())
        .manage(RuntimeInstallManager::new())
        .manage(AiRequestManager::new());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.manage(SkillProcessManager::default());

    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_ocr::init());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(mobile_system_bars::init());
    #[cfg(target_os = "ios")]
    let builder = builder.plugin(ios_ocr::init());

    builder
        .invoke_handler(tauri::generate_handler![
            start_mcp_stdio_server,
            stop_mcp_server,
            send_mcp_message,
            send_mcp_notification,
            inspect_mcp_runtime,
            install_mcp_runtime,
            cancel_mcp_runtime_install,
            get_device_id,
            list_system_fonts,
            export_app_data,
            import_app_data,
            import_app_data_from_file,
            import_skill,
            import_skill_zip,
            validate_skill_package,
            install_skill_package,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            run_skill_script,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            cancel_skill_script,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            inspect_skill_python,
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            install_skill_python_dependencies,
            ai_json_request,
            ai_binary_request,
            ai_multipart_request,
            ai_chat_completion_stream,
            cancel_ai_request,
            credential_set,
            credential_get,
            credential_delete,
            list_ocr_providers,
            run_ocr_provider,
            printing::print_webview,
            mobile_system_bars::set_mobile_system_bars,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
