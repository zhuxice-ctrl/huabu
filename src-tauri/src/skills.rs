use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Manager};
use zip::ZipArchive;

const MAX_ZIP_BYTES: u64 = 50 * 1024 * 1024;
const MAX_ENTRY_BYTES: u64 = 50 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES: u64 = 200 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 1_000;
const MAX_PATH_DEPTH: usize = 20;
const MAX_GENERATED_FILES: usize = 100;
const MAX_GENERATED_FILE_BYTES: usize = 1024 * 1024;
const MAX_GENERATED_PACKAGE_BYTES: usize = 10 * 1024 * 1024;

#[derive(serde::Deserialize, serde::Serialize)]
struct SkillFrontmatter {
    name: String,
    description: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageFile {
    path: String,
    content: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageRequest {
    name: String,
    description: String,
    instructions: String,
    #[serde(default)]
    files: Vec<SkillPackageFile>,
    #[serde(default)]
    remove_files: Vec<String>,
    scope: SkillImportScope,
    workspace_root: Option<String>,
    #[serde(default)]
    replace_existing: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageValidation {
    valid: bool,
    errors: Vec<String>,
    warnings: Vec<String>,
    file_count: usize,
    total_bytes: usize,
    has_scripts: bool,
    replacing: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageInstallResult {
    name: String,
    scope: String,
    replaced: bool,
    file_count: usize,
    has_scripts: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillImportSourceKind {
    Zip,
    Directory,
}

#[derive(serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum SkillImportScope {
    Global,
    Project,
}

fn resolve_skills_dir(
    app_handle: &AppHandle,
    scope: SkillImportScope,
    workspace_root: Option<&str>,
) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {error}"))?;
    Ok(match scope {
        SkillImportScope::Global => app_data_dir.join("skills"),
        SkillImportScope::Project => match workspace_root {
            Some(root) if !root.trim().is_empty() => PathBuf::from(root).join("skills"),
            _ => app_data_dir.join("article").join("skills"),
        },
    })
}

#[command]
pub async fn import_skill(
    app_handle: AppHandle,
    source_path: String,
    source_kind: SkillImportSourceKind,
    scope: SkillImportScope,
    workspace_root: Option<String>,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {error}"))?;
    let skills_dir = resolve_skills_dir(&app_handle, scope, workspace_root.as_deref())?;

    import_skill_source(&app_data_dir, &skills_dir, &source_path, source_kind)
}

#[command]
pub async fn validate_skill_package(
    app_handle: AppHandle,
    request: SkillPackageRequest,
) -> Result<SkillPackageValidation, String> {
    let skills_dir = resolve_skills_dir(
        &app_handle,
        request.scope,
        request.workspace_root.as_deref(),
    )?;
    Ok(validate_generated_package(&request, &skills_dir))
}

#[command]
pub async fn install_skill_package(
    app_handle: AppHandle,
    request: SkillPackageRequest,
) -> Result<SkillPackageInstallResult, String> {
    let skills_dir = resolve_skills_dir(
        &app_handle,
        request.scope,
        request.workspace_root.as_deref(),
    )?;
    let validation = validate_generated_package(&request, &skills_dir);
    if !validation.valid {
        return Err(validation.errors.join("; "));
    }

    fs::create_dir_all(&skills_dir)
        .map_err(|error| format!("Failed to create skills directory: {error}"))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock error: {error}"))?
        .as_millis();
    let staged = skills_dir.join(format!(".create-{}-{nonce}", request.name));
    let destination = skills_dir.join(&request.name);
    let backup = skills_dir.join(format!(".backup-{}-{nonce}", request.name));

    if destination.exists() && request.replace_existing {
        copy_dir_recursive(&destination, &staged)
            .map_err(|error| format!("Failed to stage the existing Skill for update: {error}"))?;
    } else {
        fs::create_dir_all(&staged)
            .map_err(|error| format!("Failed to create Skill staging directory: {error}"))?;
    }
    let write_result = (|| -> Result<(), String> {
        fs::write(staged.join("SKILL.md"), render_skill_file(&request)?)
            .map_err(|error| format!("Failed to write SKILL.md: {error}"))?;
        for file in &request.files {
            let destination = staged.join(&file.path);
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("Failed to create Skill resource directory: {error}")
                })?;
            }
            fs::write(&destination, &file.content).map_err(|error| {
                format!("Failed to write Skill resource {}: {error}", file.path)
            })?;
        }
        for relative_path in &request.remove_files {
            let target = staged.join(relative_path);
            if target.is_file() {
                fs::remove_file(&target).map_err(|error| {
                    format!("Failed to remove Skill resource {relative_path}: {error}")
                })?;
            }
        }
        validate_skill_directory(&staged, &request.name)
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_dir_all(&staged);
        return Err(error);
    }

    let replaced = destination.exists();
    activate_staged_skill(&staged, &destination, &backup, request.replace_existing)?;
    Ok(SkillPackageInstallResult {
        name: request.name,
        scope: match request.scope {
            SkillImportScope::Global => "global".to_string(),
            SkillImportScope::Project => "project".to_string(),
        },
        replaced,
        file_count: validation.file_count,
        has_scripts: validation.has_scripts,
    })
}

#[command]
pub async fn import_skill_zip(app_handle: AppHandle, zip_path: String) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {error}"))?;
    let skills_dir = app_data_dir.join("skills");
    import_skill_source(
        &app_data_dir,
        &skills_dir,
        &zip_path,
        SkillImportSourceKind::Zip,
    )
}

fn import_skill_source(
    app_data_dir: &Path,
    skills_dir: &Path,
    source_path: &str,
    source_kind: SkillImportSourceKind,
) -> Result<String, String> {
    fs::create_dir_all(&skills_dir)
        .map_err(|error| format!("Failed to create skills directory: {error}"))?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock error: {error}"))?
        .as_millis();
    let temp_dir = app_data_dir.join(format!(
        "temp_skill_import_{}_{}",
        std::process::id(),
        nonce
    ));
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Failed to create temporary import directory: {error}"))?;

    let import_result = match source_kind {
        SkillImportSourceKind::Zip => {
            let archive_metadata = fs::metadata(source_path)
                .map_err(|error| format!("Failed to inspect zip file: {error}"))?;
            if archive_metadata.len() > MAX_ZIP_BYTES {
                Err(format!(
                    "Skill archive exceeds the {} MB limit",
                    MAX_ZIP_BYTES / 1024 / 1024
                ))
            } else {
                import_skill_zip_inner(source_path, &temp_dir, skills_dir, nonce)
            }
        }
        SkillImportSourceKind::Directory => {
            import_skill_directory_inner(source_path, skills_dir, nonce)
        }
    };
    if let Err(error) = fs::remove_dir_all(&temp_dir) {
        eprintln!("Failed to clean Skill import temporary directory: {error}");
    }
    import_result
}

fn import_skill_directory_inner(
    source_path: &str,
    skills_dir: &Path,
    nonce: u128,
) -> Result<String, String> {
    let source = Path::new(source_path);
    let metadata = fs::symlink_metadata(source)
        .map_err(|error| format!("Failed to inspect Skill folder: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("The selected Skill source must be a regular folder".to_string());
    }
    let mut entry_count = 0;
    let mut total_bytes = 0;
    validate_directory_tree(source, 0, &mut entry_count, &mut total_bytes)?;

    let mut roots = Vec::new();
    collect_skill_roots(source, 0, &mut roots)?;
    install_discovered_skill(roots, source, source_path, skills_dir, nonce)
}

fn import_skill_zip_inner(
    zip_path: &str,
    temp_dir: &Path,
    skills_dir: &Path,
    nonce: u128,
) -> Result<String, String> {
    let file =
        fs::File::open(zip_path).map_err(|error| format!("Failed to open zip file: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Failed to read zip archive: {error}"))?;

    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!(
            "Skill archive contains more than {MAX_ARCHIVE_ENTRIES} entries"
        ));
    }

    let mut total_uncompressed = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read zip entry: {error}"))?;
        let relative_path = entry
            .enclosed_name()
            .ok_or_else(|| format!("Unsafe path in Skill archive: {}", entry.name()))?
            .to_path_buf();

        if relative_path.components().count() > MAX_PATH_DEPTH {
            return Err(format!(
                "Skill archive path is nested too deeply: {}",
                entry.name()
            ));
        }
        if is_symlink(&entry) {
            return Err(format!(
                "Symbolic links are not allowed in Skill archives: {}",
                entry.name()
            ));
        }
        if entry.size() > MAX_ENTRY_BYTES {
            return Err(format!(
                "Skill archive entry exceeds the size limit: {}",
                entry.name()
            ));
        }

        total_uncompressed = total_uncompressed
            .checked_add(entry.size())
            .ok_or("Skill archive size overflow")?;
        if total_uncompressed > MAX_UNCOMPRESSED_BYTES {
            return Err(format!(
                "Uncompressed Skill archive exceeds the {} MB limit",
                MAX_UNCOMPRESSED_BYTES / 1024 / 1024
            ));
        }

        let output_path = temp_dir.join(relative_path);
        if entry.is_dir() {
            fs::create_dir_all(&output_path)
                .map_err(|error| format!("Failed to create archive directory: {error}"))?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create archive parent directory: {error}"))?;
        }
        let mut output = fs::File::create(&output_path)
            .map_err(|error| format!("Failed to create extracted file: {error}"))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|error| format!("Failed to extract archive file: {error}"))?;
    }

    let mut roots = Vec::new();
    collect_skill_roots(temp_dir, 0, &mut roots)?;
    install_discovered_skill(roots, temp_dir, zip_path, skills_dir, nonce)
}

fn install_discovered_skill(
    mut roots: Vec<PathBuf>,
    discovery_root: &Path,
    source_path: &str,
    skills_dir: &Path,
    nonce: u128,
) -> Result<String, String> {
    if roots.is_empty() {
        return Err(
            "No valid Skill found. The selected source must contain exactly one SKILL.md root."
                .to_string(),
        );
    }
    if roots.len() != 1 {
        return Err(
            "The selected source contains multiple SKILL.md roots; import each Skill separately."
                .to_string(),
        );
    }
    let skill_root = roots.remove(0);
    let skill_name = if skill_root == discovery_root {
        Path::new(source_path)
            .file_stem()
            .and_then(|name| name.to_str())
            .ok_or("Failed to determine Skill directory name")?
            .to_string()
    } else {
        skill_root
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("Failed to determine Skill directory name")?
            .to_string()
    };
    if !is_safe_skill_name(&skill_name) {
        return Err(
            "Skill directory name must contain 1-64 lowercase letters, digits, or hyphens"
                .to_string(),
        );
    }
    validate_skill_directory(&skill_root, &skill_name)?;

    let destination = skills_dir.join(&skill_name);
    let staged = skills_dir.join(format!(".import-{skill_name}-{nonce}"));
    let backup = skills_dir.join(format!(".backup-{skill_name}-{nonce}"));
    if let Err(error) = copy_dir_recursive(&skill_root, &staged) {
        let _ = fs::remove_dir_all(&staged);
        return Err(format!("Failed to stage Skill import: {error}"));
    }
    activate_staged_skill(&staged, &destination, &backup, true)?;

    Ok(skill_name)
}

fn activate_staged_skill(
    staged: &Path,
    destination: &Path,
    backup: &Path,
    replace_existing: bool,
) -> Result<(), String> {
    let had_existing = destination.exists();
    if had_existing && !replace_existing {
        let _ = fs::remove_dir_all(staged);
        return Err("A Skill with this name already exists. Set replaceExisting only when the user explicitly asks to update it.".to_string());
    }
    if had_existing {
        fs::rename(destination, backup)
            .map_err(|error| format!("Failed to back up existing Skill: {error}"))?;
    }

    if let Err(error) = fs::rename(staged, destination) {
        let _ = fs::remove_dir_all(staged);
        if had_existing {
            let _ = fs::rename(backup, destination);
        }
        return Err(format!("Failed to activate Skill: {error}"));
    }
    if had_existing {
        if let Err(error) = fs::remove_dir_all(backup) {
            eprintln!("Failed to clean previous Skill version after install: {error}");
        }
    }
    Ok(())
}

fn validate_generated_package(
    request: &SkillPackageRequest,
    skills_dir: &Path,
) -> SkillPackageValidation {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut total_bytes = request.instructions.len() + request.description.len();
    let mut seen_paths = HashSet::new();

    if !is_safe_skill_name(&request.name) {
        errors.push("Skill name must contain 1-64 lowercase ASCII letters, digits, or hyphens, without leading, trailing, or consecutive hyphens".to_string());
    }
    if request.description.trim().is_empty() || request.description.chars().count() > 1024 {
        errors.push("Skill description must contain 1-1024 characters".to_string());
    }
    if request.instructions.trim().is_empty() {
        errors.push("Skill instructions cannot be empty".to_string());
    }
    if request.instructions.lines().count() > 500 {
        warnings.push(
            "SKILL.md exceeds 500 instruction lines; move detailed material into references/"
                .to_string(),
        );
    }
    if request.files.len() > MAX_GENERATED_FILES {
        errors.push(format!(
            "Skill package cannot contain more than {MAX_GENERATED_FILES} resource files"
        ));
    }

    for file in &request.files {
        let path = Path::new(&file.path);
        if !is_safe_generated_file_path(path) {
            errors.push(format!("Invalid Skill resource path: {}", file.path));
            continue;
        }
        let normalized = file.path.replace('\\', "/");
        if !seen_paths.insert(normalized.clone()) {
            errors.push(format!("Duplicate Skill resource path: {normalized}"));
        }
        if normalized.starts_with("scripts/") {
            let supported = matches!(
                path.extension().and_then(|extension| extension.to_str()),
                Some("py" | "sh" | "bash" | "js" | "mjs")
            );
            if !supported {
                errors.push(format!(
                    "Unsupported Skill script type: {normalized}. Use Python, Bash, or JavaScript."
                ));
            }
        }
        let file_bytes = file.content.len();
        if file_bytes > MAX_GENERATED_FILE_BYTES {
            errors.push(format!(
                "Skill resource exceeds the 1 MB limit: {normalized}"
            ));
        }
        total_bytes = total_bytes.saturating_add(file_bytes);
    }
    for path in &request.remove_files {
        let resource_path = Path::new(path);
        if !is_safe_generated_file_path(resource_path) {
            errors.push(format!("Invalid removed Skill resource path: {path}"));
            continue;
        }
        let normalized = path.replace('\\', "/");
        if seen_paths.contains(&normalized) {
            errors.push(format!(
                "Skill resource cannot be written and removed in the same update: {normalized}"
            ));
        }
    }
    if !request.remove_files.is_empty() && !request.replace_existing {
        errors.push(
            "removeFiles can only be used while explicitly updating an existing Skill".to_string(),
        );
    }
    if total_bytes > MAX_GENERATED_PACKAGE_BYTES {
        errors.push("Generated Skill package exceeds the 10 MB limit".to_string());
    }

    let replacing = is_safe_skill_name(&request.name) && skills_dir.join(&request.name).exists();
    if replacing && !request.replace_existing {
        errors.push("A Skill with this name already exists; inspect it first and set replaceExisting only for an explicit update".to_string());
    }
    if replacing && request.replace_existing {
        warnings.push(
            "Installing this package will update the existing Skill through a staged atomic swap"
                .to_string(),
        );
    }
    let has_scripts = request
        .files
        .iter()
        .any(|file| file.path.replace('\\', "/").starts_with("scripts/"))
        || (replacing && skills_dir.join(&request.name).join("scripts").is_dir());
    if has_scripts {
        warnings.push("This Skill contains executable scripts. Script execution requires separate approval and is bound to the installed file hash.".to_string());
    }

    SkillPackageValidation {
        valid: errors.is_empty(),
        errors,
        warnings,
        file_count: request.files.len() + 1,
        total_bytes,
        has_scripts,
        replacing,
    }
}

fn is_safe_generated_file_path(path: &Path) -> bool {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return false;
    }
    let components: Vec<_> = path.components().collect();
    if components.len() < 2 || components.len() > MAX_PATH_DEPTH {
        return false;
    }
    if components
        .iter()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return false;
    }
    let first = components.first().and_then(|component| match component {
        Component::Normal(value) => value.to_str(),
        _ => None,
    });
    if !matches!(first, Some("scripts" | "references" | "assets" | "agents")) {
        return false;
    }
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| !name.starts_with('.') && !name.contains('\0'))
        .unwrap_or(false)
}

fn render_skill_file(request: &SkillPackageRequest) -> Result<String, String> {
    let yaml = serde_yaml::to_string(&SkillFrontmatter {
        name: request.name.clone(),
        description: request.description.trim().to_string(),
    })
    .map_err(|error| format!("Failed to serialize Skill metadata: {error}"))?;
    Ok(format!(
        "---\n{yaml}---\n\n{}\n",
        request.instructions.trim()
    ))
}

fn validate_skill_directory(skill_root: &Path, expected_name: &str) -> Result<(), String> {
    let content = fs::read_to_string(skill_root.join("SKILL.md"))
        .map_err(|error| format!("Failed to read SKILL.md: {error}"))?;
    let metadata = parse_skill_frontmatter(&content)?;
    if metadata.name != expected_name {
        return Err(format!(
            "SKILL.md name \"{}\" must match its parent directory \"{expected_name}\"",
            metadata.name
        ));
    }
    if !is_safe_skill_name(&metadata.name) {
        return Err("SKILL.md name does not follow Agent Skills naming rules".to_string());
    }
    if metadata.description.trim().is_empty() || metadata.description.chars().count() > 1024 {
        return Err("SKILL.md description must contain 1-1024 characters".to_string());
    }
    Ok(())
}

fn parse_skill_frontmatter(content: &str) -> Result<SkillFrontmatter, String> {
    let normalized = content.trim_start_matches('\u{feff}');
    let body = normalized
        .strip_prefix("---\n")
        .or_else(|| normalized.strip_prefix("---\r\n"))
        .ok_or("SKILL.md must start with YAML frontmatter")?;
    let end = body
        .find("\n---")
        .ok_or("SKILL.md YAML frontmatter is not closed")?;
    serde_yaml::from_str(&body[..end])
        .map_err(|error| format!("Invalid SKILL.md YAML frontmatter: {error}"))
}

fn validate_directory_tree(
    root: &Path,
    depth: usize,
    entry_count: &mut usize,
    total_bytes: &mut u64,
) -> Result<(), String> {
    if depth > MAX_PATH_DEPTH {
        return Err("Skill folder nesting exceeds the allowed depth".to_string());
    }

    for entry in
        fs::read_dir(root).map_err(|error| format!("Failed to read Skill folder: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read Skill folder entry: {error}"))?;
        *entry_count += 1;
        if *entry_count > MAX_ARCHIVE_ENTRIES {
            return Err(format!(
                "Skill folder contains more than {MAX_ARCHIVE_ENTRIES} entries"
            ));
        }

        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("Failed to inspect Skill folder entry: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Symbolic links are not allowed: {}",
                entry.path().display()
            ));
        }
        if metadata.is_file() {
            if metadata.len() > MAX_ENTRY_BYTES {
                return Err(format!(
                    "Skill file exceeds the size limit: {}",
                    entry.path().display()
                ));
            }
            *total_bytes = total_bytes
                .checked_add(metadata.len())
                .ok_or("Skill folder size overflow")?;
            if *total_bytes > MAX_UNCOMPRESSED_BYTES {
                return Err(format!(
                    "Skill folder exceeds the {} MB limit",
                    MAX_UNCOMPRESSED_BYTES / 1024 / 1024
                ));
            }
        } else if metadata.is_dir() {
            validate_directory_tree(&entry.path(), depth + 1, entry_count, total_bytes)?;
        }
    }
    Ok(())
}

fn is_symlink<R: std::io::Read>(entry: &zip::read::ZipFile<'_, R>) -> bool {
    entry
        .unix_mode()
        .map(|mode| mode & 0o170000 == 0o120000)
        .unwrap_or(false)
}

fn is_safe_skill_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 64
        && bytes.first() != Some(&b'-')
        && bytes.last() != Some(&b'-')
        && !name.contains("--")
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
}

fn collect_skill_roots(root: &Path, depth: usize, roots: &mut Vec<PathBuf>) -> Result<(), String> {
    if depth > MAX_PATH_DEPTH {
        return Err("Skill archive directory nesting exceeds the allowed depth".to_string());
    }
    if root.join("SKILL.md").is_file() {
        roots.push(root.to_path_buf());
    }

    for entry in
        fs::read_dir(root).map_err(|error| format!("Failed to read archive directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read archive entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() && !is_ignored_zip_metadata_dir(&path) {
            collect_skill_roots(&path, depth + 1, roots)?;
        }
    }
    Ok(())
}

fn is_ignored_zip_metadata_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name == "__MACOSX")
        .unwrap_or(false)
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("Failed to create directory: {error}"))?;
    for entry in
        fs::read_dir(source).map_err(|error| format!("Failed to read source directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect imported file: {error}"))?;
        if file_type.is_symlink() {
            return Err(format!(
                "Symbolic links are not allowed: {}",
                source_path.display()
            ));
        }
        if file_type.is_file() {
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("Failed to copy file: {error}"))?;
        } else if file_type.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn test_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("notegen-{label}-{}", uuid::Uuid::new_v4()))
    }

    fn write_test_archive(path: &Path, entries: &[(&str, &str)]) {
        let file = fs::File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, content) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn validates_skill_directory_names() {
        assert!(is_safe_skill_name("secure-skill"));
        assert!(!is_safe_skill_name("Secure-Skill"));
        assert!(!is_safe_skill_name("../secure-skill"));
        assert!(!is_safe_skill_name("-secure"));
        assert!(!is_safe_skill_name("secure--skill"));
    }

    fn generated_request(name: &str, replace_existing: bool) -> SkillPackageRequest {
        SkillPackageRequest {
            name: name.to_string(),
            description: "Create concise weekly reports when the user asks for a weekly summary."
                .to_string(),
            instructions: "# Workflow\n\n1. Read this week's notes.\n2. Create the report."
                .to_string(),
            files: vec![SkillPackageFile {
                path: "references/format.md".to_string(),
                content: "# Format\n".to_string(),
            }],
            remove_files: Vec::new(),
            scope: SkillImportScope::Global,
            workspace_root: None,
            replace_existing,
        }
    }

    #[test]
    fn validates_generated_skill_packages() {
        let root = test_directory("generated-validation");
        let request = generated_request("create-weekly-report", false);
        let validation = validate_generated_package(&request, &root);
        assert!(validation.valid);
        assert_eq!(validation.file_count, 2);
        assert!(!validation.has_scripts);

        let mut invalid = generated_request("Unsafe Name", false);
        invalid.files[0].path = "../outside.md".to_string();
        let validation = validate_generated_package(&invalid, &root);
        assert!(!validation.valid);
        assert_eq!(validation.errors.len(), 2);
    }

    #[test]
    fn generated_skill_install_is_atomic_and_requires_explicit_replace() {
        let root = test_directory("generated-install");
        let skills_dir = root.join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        let request = generated_request("create-weekly-report", false);
        let staged = skills_dir.join(".create-create-weekly-report-1");
        fs::create_dir_all(staged.join("references")).unwrap();
        fs::write(
            staged.join("SKILL.md"),
            render_skill_file(&request).unwrap(),
        )
        .unwrap();
        fs::write(staged.join("references/format.md"), "format").unwrap();
        let destination = skills_dir.join("create-weekly-report");
        let backup = skills_dir.join(".backup-create-weekly-report-1");
        activate_staged_skill(&staged, &destination, &backup, false).unwrap();
        assert!(destination.join("SKILL.md").is_file());

        let second_staged = skills_dir.join(".create-create-weekly-report-2");
        fs::create_dir_all(&second_staged).unwrap();
        fs::write(
            second_staged.join("SKILL.md"),
            render_skill_file(&request).unwrap(),
        )
        .unwrap();
        assert!(activate_staged_skill(&second_staged, &destination, &backup, false).is_err());
        assert!(destination.join("SKILL.md").is_file());

        let update_staged = skills_dir.join(".create-create-weekly-report-3");
        copy_dir_recursive(&destination, &update_staged).unwrap();
        fs::write(update_staged.join("SKILL.md"), "updated").unwrap();
        activate_staged_skill(&update_staged, &destination, &backup, true).unwrap();
        assert_eq!(
            fs::read_to_string(destination.join("SKILL.md")).unwrap(),
            "updated"
        );
        assert!(destination.join("references/format.md").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn detects_multiple_skill_roots() {
        let root = test_directory("multiple-roots");
        fs::create_dir_all(root.join("one")).unwrap();
        fs::create_dir_all(root.join("two")).unwrap();
        fs::write(root.join("one/SKILL.md"), "---\nname: one\n---").unwrap();
        fs::write(root.join("two/SKILL.md"), "---\nname: two\n---").unwrap();
        let mut roots = Vec::new();
        collect_skill_roots(&root, 0, &mut roots).unwrap();
        assert_eq!(roots.len(), 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn detects_zip_symbolic_links() {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .add_symlink("unsafe-link", "/tmp/private", SimpleFileOptions::default())
            .unwrap();
        let bytes = writer.finish().unwrap().into_inner();
        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let entry = archive.by_index(0).unwrap();
        assert!(is_symlink(&entry));
    }

    #[test]
    fn imports_through_staging_and_replaces_existing_skill() {
        let root = test_directory("atomic-import");
        let archive_path = root.join("secure-skill.zip");
        let extract_dir = root.join("extract");
        let skills_dir = root.join("skills");
        fs::create_dir_all(&extract_dir).unwrap();
        fs::create_dir_all(skills_dir.join("secure-skill")).unwrap();
        fs::write(skills_dir.join("secure-skill/old.txt"), "old").unwrap();
        write_test_archive(
            &archive_path,
            &[
                (
                    "secure-skill/SKILL.md",
                    "---\nname: secure-skill\ndescription: test\n---\n",
                ),
                ("secure-skill/scripts/ok.py", "print('ok')\n"),
            ],
        );

        let imported =
            import_skill_zip_inner(archive_path.to_str().unwrap(), &extract_dir, &skills_dir, 1)
                .unwrap();
        assert_eq!(imported, "secure-skill");
        assert!(skills_dir.join("secure-skill/scripts/ok.py").is_file());
        assert!(!skills_dir.join("secure-skill/old.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn imports_skill_from_directory() {
        let root = test_directory("directory-import");
        let source = root.join("folder-skill");
        let skills_dir = root.join("skills");
        fs::create_dir_all(source.join("references")).unwrap();
        fs::write(
            source.join("SKILL.md"),
            "---\nname: folder-skill\ndescription: test\n---\n",
        )
        .unwrap();
        fs::write(source.join("references/guide.md"), "guide").unwrap();

        let imported =
            import_skill_directory_inner(source.to_str().unwrap(), &skills_dir, 1).unwrap();

        assert_eq!(imported, "folder-skill");
        assert!(skills_dir.join("folder-skill/SKILL.md").is_file());
        assert!(skills_dir
            .join("folder-skill/references/guide.md")
            .is_file());
        fs::remove_dir_all(root).unwrap();
    }
}
