use crate::workspace::{DesktopCommandError, WorkspaceFileContent, WorkspaceWriteResult};
use crate::workspace_path::{
    chemd_kind_for_path, clean_relative_path, outside_root, relative_to_string,
};
use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_READ_BYTES: u64 = 2 * 1024 * 1024;
const HASH_OFFSET: u64 = 0xcbf29ce484222325;
const HASH_PRIME: u64 = 0x100000001b3;

pub(crate) fn read_workspace_file_impl(
    root: &Path,
    path: &str,
) -> Result<WorkspaceFileContent, DesktopCommandError> {
    let relative = clean_relative_path(path)?;
    let target = canonical_existing_file(root, &relative)?;
    let metadata = fs::metadata(&target).map_err(|err| {
        DesktopCommandError::io(
            "workspace_read_failed",
            "Workspace file metadata failed",
            err,
        )
    })?;
    if metadata.len() > MAX_READ_BYTES {
        return Err(DesktopCommandError::new(
            "workspace_file_too_large",
            "Workspace file is too large to read safely",
            Some(relative_to_string(&relative)),
        ));
    }
    let content = fs::read_to_string(&target).map_err(|err| {
        DesktopCommandError::io(
            "workspace_read_failed",
            "Workspace file cannot be read",
            err,
        )
    })?;
    let modified_at_ms = modified_at_ms(&metadata);
    Ok(WorkspaceFileContent {
        path: relative_to_string(&relative),
        bytes: content.len(),
        content_hash: content_hash(content.as_bytes()),
        modified_at_ms,
        content,
        chemd_kind: chemd_kind_for_path(&target),
    })
}

pub(crate) fn write_workspace_file_impl(
    root: &Path,
    path: &str,
    content: &str,
    base_hash: Option<&str>,
) -> Result<WorkspaceWriteResult, DesktopCommandError> {
    let relative = clean_relative_path(path)?;
    let target = root.join(&relative);
    ensure_write_target_inside_root(root, &target)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            DesktopCommandError::io(
                "workspace_write_failed",
                "Workspace directory cannot be created",
                err,
            )
        })?;
    }
    let tmp_path = write_temp_file(&target, content.as_bytes())?;
    if let Err(err) = ensure_base_hash(&target, base_hash) {
        let _ = fs::remove_file(&tmp_path);
        return Err(err);
    }
    commit_temp_file(&tmp_path, &target)?;
    let metadata = fs::metadata(&target).map_err(|err| {
        DesktopCommandError::io(
            "workspace_write_failed",
            "Workspace file metadata failed after write",
            err,
        )
    })?;
    Ok(WorkspaceWriteResult {
        path: relative_to_string(&relative),
        bytes: content.len(),
        content_hash: content_hash(content.as_bytes()),
        modified_at_ms: modified_at_ms(&metadata),
        chemd_kind: chemd_kind_for_path(&target),
    })
}

pub(crate) fn content_hash(content: &[u8]) -> String {
    let hash = content.iter().fold(HASH_OFFSET, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(HASH_PRIME)
    });
    format!("fnv1a64:{hash:016x}")
}

fn canonical_existing_file(root: &Path, relative: &Path) -> Result<PathBuf, DesktopCommandError> {
    let target = fs::canonicalize(root.join(relative)).map_err(|err| {
        DesktopCommandError::io(
            "workspace_file_not_found",
            "Workspace file cannot be found",
            err,
        )
    })?;
    if !target.starts_with(root) {
        return Err(outside_root(relative));
    }
    if !target.is_file() {
        return Err(DesktopCommandError::new(
            "workspace_not_file",
            "Workspace path is not a file",
            Some(relative.display().to_string()),
        ));
    }
    Ok(target)
}

fn ensure_write_target_inside_root(root: &Path, target: &Path) -> Result<(), DesktopCommandError> {
    if target.exists() {
        let canonical = fs::canonicalize(target).map_err(|err| {
            DesktopCommandError::io(
                "workspace_write_failed",
                "Workspace target cannot be checked",
                err,
            )
        })?;
        if !canonical.starts_with(root) || canonical.is_dir() {
            return Err(outside_root(target));
        }
        return Ok(());
    }

    let mut ancestor = target.parent();
    while let Some(path) = ancestor {
        if path.exists() {
            let canonical = fs::canonicalize(path).map_err(|err| {
                DesktopCommandError::io(
                    "workspace_write_failed",
                    "Workspace parent cannot be checked",
                    err,
                )
            })?;
            return if canonical.starts_with(root) {
                Ok(())
            } else {
                Err(outside_root(target))
            };
        }
        ancestor = path.parent();
    }
    Err(outside_root(target))
}

fn ensure_base_hash(target: &Path, base_hash: Option<&str>) -> Result<(), DesktopCommandError> {
    let Some(expected) = normalized_base_hash(base_hash) else {
        return Ok(());
    };
    if !target.exists() {
        return Err(conflict_error(
            "Workspace file was deleted before save",
            Some(expected.to_string()),
            None,
        ));
    }
    let current = fs::read(target).map_err(|err| {
        DesktopCommandError::io(
            "workspace_read_failed",
            "Workspace file cannot be checked before save",
            err,
        )
    })?;
    let actual = content_hash(&current);
    if actual == expected {
        return Ok(());
    }
    Err(conflict_error(
        "Workspace file changed outside the editor",
        Some(expected.to_string()),
        Some(actual),
    ))
}

fn normalized_base_hash(base_hash: Option<&str>) -> Option<&str> {
    let value = base_hash?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn conflict_error(
    message: &str,
    expected: Option<String>,
    actual: Option<String>,
) -> DesktopCommandError {
    DesktopCommandError::new(
        "workspace_file_conflict",
        message,
        Some(format!(
            "expectedBaseHash={}, actualHash={}",
            expected.unwrap_or_else(|| "none".into()),
            actual.unwrap_or_else(|| "none".into())
        )),
    )
}

fn write_temp_file(target: &Path, content: &[u8]) -> Result<PathBuf, DesktopCommandError> {
    let tmp_path = temp_path(target);
    let mut file = File::create(&tmp_path).map_err(|err| {
        DesktopCommandError::io(
            "workspace_atomic_write_failed",
            "Workspace temp file cannot be created",
            err,
        )
    })?;
    file.write_all(content).map_err(|err| {
        DesktopCommandError::io(
            "workspace_atomic_write_failed",
            "Workspace temp file cannot be written",
            err,
        )
    })?;
    file.sync_all().map_err(|err| {
        DesktopCommandError::io(
            "workspace_atomic_write_failed",
            "Workspace temp file cannot be flushed",
            err,
        )
    })?;
    Ok(tmp_path)
}

fn commit_temp_file(tmp_path: &Path, target: &Path) -> Result<(), DesktopCommandError> {
    replace_file(tmp_path, target).map_err(|err| {
        let _ = fs::remove_file(tmp_path);
        DesktopCommandError::new(
            "workspace_atomic_commit_failed",
            "Workspace temp file cannot be committed",
            Some(format!("{} while replacing {}", err, target.display())),
        )
    })
}

#[cfg(windows)]
fn replace_file(tmp_path: &Path, target: &Path) -> std::io::Result<()> {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt};

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    extern "system" {
        fn MoveFileExW(
            lp_existing_file_name: *const u16,
            lp_new_file_name: *const u16,
            dw_flags: u32,
        ) -> i32;
    }

    fn wide(path: &OsStr) -> Vec<u16> {
        path.encode_wide().chain(std::iter::once(0)).collect()
    }

    let from = wide(tmp_path.as_os_str());
    let to = wide(target.as_os_str());
    let ok = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(tmp_path: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(tmp_path, target)
}

fn temp_path(target: &Path) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("workspace-file");
    target.with_file_name(format!("{name}.tmp-{}-{suffix}", std::process::id()))
}

fn modified_at_ms(metadata: &fs::Metadata) -> Option<u64> {
    let modified = metadata.modified().ok()?;
    let millis = modified.duration_since(UNIX_EPOCH).ok()?.as_millis();
    Some(u64::try_from(millis).unwrap_or(u64::MAX))
}
