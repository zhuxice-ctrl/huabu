use serde::Deserialize;
use serde_json::Value;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    ConnectOptions,
};
use std::str::FromStr;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteTransactionStatement {
    query: String,
    #[serde(default)]
    bind_values: Vec<Value>,
    min_rows_affected: Option<u64>,
}

fn bind_json<'q>(
    mut query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: Value,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    query = match value {
        Value::Null => query.bind(Option::<String>::None),
        Value::Bool(value) => query.bind(value),
        Value::Number(value) if value.is_i64() => query.bind(value.as_i64().unwrap_or_default()),
        Value::Number(value) if value.is_u64() => {
            query.bind(value.as_u64().unwrap_or_default() as i64)
        }
        Value::Number(value) => query.bind(value.as_f64().unwrap_or_default()),
        Value::String(value) => query.bind(value),
        other => query.bind(other.to_string()),
    };
    query
}

#[tauri::command]
pub async fn execute_sqlite_transaction(
    database_url: String,
    statements: Vec<SqliteTransactionStatement>,
) -> Result<Vec<u64>, String> {
    let options = SqliteConnectOptions::from_str(&database_url)
        .map_err(|error| error.to_string())?
        .create_if_missing(false)
        .disable_statement_logging();
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let mut affected = Vec::with_capacity(statements.len());

    for statement in statements {
        let mut query = sqlx::query(&statement.query);
        for value in statement.bind_values {
            query = bind_json(query, value);
        }
        let result = query
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        let rows = result.rows_affected();
        if rows < statement.min_rows_affected.unwrap_or(0) {
            return Err(format!(
                "Atomic SQLite precondition failed: expected at least {} affected row(s), got {rows}.",
                statement.min_rows_affected.unwrap_or(0)
            ));
        }
        affected.push(rows);
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(affected)
}

#[tauri::command]
pub fn workspace_available_bytes(path: String) -> Result<u64, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

        let wide: Vec<u16> = std::ffi::OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut available = 0_u64;
        let result = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut available,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if result == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(available)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(u64::MAX)
    }
}

#[tauri::command]
pub fn assert_no_reparse_points(path: String, allow_missing_leaf: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileAttributesW, FILE_ATTRIBUTE_REPARSE_POINT, INVALID_FILE_ATTRIBUTES,
        };

        let mut current = std::path::PathBuf::from(path);
        let mut leaf = true;
        loop {
            let wide: Vec<u16> = current
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let attributes = unsafe { GetFileAttributesW(wide.as_ptr()) };
            if attributes == INVALID_FILE_ATTRIBUTES {
                if !(leaf && allow_missing_leaf) {
                    return Err(format!(
                        "Workspace recovery path is unavailable: {}",
                        current.display()
                    ));
                }
            } else if attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(format!(
                    "Workspace recovery path contains a Windows reparse point: {}",
                    current.display()
                ));
            }
            leaf = false;
            if !current.pop() {
                break;
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (path, allow_missing_leaf);
        Ok(())
    }
}
