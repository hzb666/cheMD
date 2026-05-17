use crate::workspace::{CommandError, WorkspaceFileContent, WorkspaceWriteResult};
use crate::workspace_path::{
    chemd_kind_for_path, clean_relative_path, outside_root, relative_to_string,
};
#[cfg(test)]
use std::cell::RefCell;
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) const MAX_WORKSPACE_FILE_BYTES: u64 = 5 * 1024 * 1024;
const HASH_OFFSET: u64 = 0xcbf29ce484222325;
const HASH_PRIME: u64 = 0x100000001b3;

#[cfg(test)]
thread_local! {
    static BEFORE_WORKSPACE_COMMIT_HOOK: RefCell<Option<Box<dyn FnOnce()>>> =
        RefCell::new(None);
}

#[cfg(test)]
pub(crate) fn set_before_workspace_commit_hook_for_test(hook: impl FnOnce() + 'static) {
    BEFORE_WORKSPACE_COMMIT_HOOK.with(|slot| {
        *slot.borrow_mut() = Some(Box::new(hook));
    });
}

#[cfg(test)]
fn run_before_workspace_commit_hook_for_test() {
    BEFORE_WORKSPACE_COMMIT_HOOK.with(|slot| {
        if let Some(hook) = slot.borrow_mut().take() {
            hook();
        }
    });
}

#[cfg(not(test))]
fn run_before_workspace_commit_hook_for_test() {}

pub(crate) fn read_workspace_file_impl(
    root: &Path,
    path: &str,
) -> Result<WorkspaceFileContent, CommandError> {
    let relative = clean_relative_path(path)?;
    let target = canonical_existing_file(root, &relative)?;
    let metadata = fs::metadata(&target).map_err(|err| {
        CommandError::io(
            "workspace_read_failed",
            "Workspace file metadata failed",
            err,
        )
    })?;
    if metadata.len() > MAX_WORKSPACE_FILE_BYTES {
        return Err(file_too_large(&relative));
    }
    let content = fs::read_to_string(&target).map_err(|err| {
        CommandError::io(
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
) -> Result<WorkspaceWriteResult, CommandError> {
    let relative = clean_relative_path(path)?;
    ensure_content_within_limit(&relative, content.as_bytes())?;
    let target = root.join(&relative);
    let tmp_path = write_checked_temp_file(root, &target, content.as_bytes())?;
    commit_checked_temp_file(root, &tmp_path, &target, &relative, base_hash)?;
    let metadata = fs::metadata(&target).map_err(|err| {
        CommandError::io(
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

fn canonical_existing_file(root: &Path, relative: &Path) -> Result<PathBuf, CommandError> {
    let target = fs::canonicalize(root.join(relative)).map_err(|err| {
        CommandError::io(
            "workspace_file_not_found",
            "Workspace file cannot be found",
            err,
        )
    })?;
    if !target.starts_with(root) {
        return Err(outside_root(relative));
    }
    if !target.is_file() {
        return Err(CommandError::new(
            "workspace_not_file",
            "Workspace path is not a file",
            Some(relative.display().to_string()),
        ));
    }
    Ok(target)
}

fn ensure_write_target_inside_root(root: &Path, target: &Path) -> Result<(), CommandError> {
    if target.exists() {
        let canonical = fs::canonicalize(target).map_err(|err| {
            CommandError::io(
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
                CommandError::io(
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

fn ensure_temp_file_inside_root(root: &Path, tmp_path: &Path) -> Result<(), CommandError> {
    let canonical = fs::canonicalize(tmp_path).map_err(|err| {
        CommandError::io(
            "workspace_write_failed",
            "Workspace temp file cannot be checked",
            err,
        )
    })?;
    if canonical.starts_with(root) && canonical.is_file() {
        Ok(())
    } else {
        Err(outside_root(tmp_path))
    }
}

fn create_workspace_parent(target: &Path) -> Result<(), CommandError> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            CommandError::io(
                "workspace_write_failed",
                "Workspace directory cannot be created",
                err,
            )
        })?;
    }
    Ok(())
}

fn write_checked_temp_file(
    root: &Path,
    target: &Path,
    content: &[u8],
) -> Result<PathBuf, CommandError> {
    ensure_write_target_inside_root(root, target)?;
    create_workspace_parent(target)?;
    ensure_write_target_inside_root(root, target)?;
    let tmp_path = write_temp_file(target, content)?;
    if let Err(err) = ensure_temp_file_inside_root(root, &tmp_path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(err);
    }
    Ok(tmp_path)
}

fn commit_checked_temp_file(
    root: &Path,
    tmp_path: &Path,
    target: &Path,
    relative: &Path,
    base_hash: Option<&str>,
) -> Result<(), CommandError> {
    run_before_workspace_commit_hook_for_test();
    if let Err(err) = ensure_write_target_inside_root(root, target)
        .and_then(|_| ensure_temp_file_inside_root(root, tmp_path))
        .and_then(|_| ensure_base_hash(target, relative, base_hash))
    {
        let _ = fs::remove_file(tmp_path);
        return Err(err);
    }
    commit_temp_file(tmp_path, target)
}

fn ensure_base_hash(
    target: &Path,
    relative: &Path,
    base_hash: Option<&str>,
) -> Result<(), CommandError> {
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
    let current = read_file_bytes_with_limit(target, relative)?;
    ensure_base_hash_for_content(&current, base_hash)
}

fn read_file_bytes_with_limit(target: &Path, relative: &Path) -> Result<Vec<u8>, CommandError> {
    let file = File::open(target).map_err(|err| {
        CommandError::io(
            "workspace_read_failed",
            "Workspace file cannot be checked before save",
            err,
        )
    })?;
    let mut reader = file.take(MAX_WORKSPACE_FILE_BYTES + 1);
    let mut content = Vec::new();
    reader.read_to_end(&mut content).map_err(|err| {
        CommandError::io(
            "workspace_read_failed",
            "Workspace file cannot be checked before save",
            err,
        )
    })?;
    if (content.len() as u64) > MAX_WORKSPACE_FILE_BYTES {
        return Err(file_too_large(relative));
    }
    Ok(content)
}

fn ensure_base_hash_for_content(
    content: &[u8],
    base_hash: Option<&str>,
) -> Result<(), CommandError> {
    let Some(expected) = normalized_base_hash(base_hash) else {
        return Ok(());
    };
    let actual = content_hash(content);
    if actual == expected {
        return Ok(());
    }
    Err(conflict_error(
        "Workspace file changed outside the editor",
        Some(expected.to_string()),
        Some(actual),
    ))
}

fn file_too_large(path: &Path) -> CommandError {
    CommandError::new(
        "workspace_file_too_large",
        "Workspace file is too large to read safely",
        Some(relative_to_string(path)),
    )
}

fn ensure_content_within_limit(relative: &Path, content: &[u8]) -> Result<(), CommandError> {
    if (content.len() as u64) <= MAX_WORKSPACE_FILE_BYTES {
        return Ok(());
    }
    Err(file_too_large(relative))
}

fn normalized_base_hash(base_hash: Option<&str>) -> Option<&str> {
    let value = base_hash?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn conflict_error(message: &str, expected: Option<String>, actual: Option<String>) -> CommandError {
    CommandError::new(
        "workspace_file_conflict",
        message,
        Some(format!(
            "expectedBaseHash={}, actualHash={}",
            expected.unwrap_or_else(|| "none".into()),
            actual.unwrap_or_else(|| "none".into())
        )),
    )
}

fn write_temp_file(target: &Path, content: &[u8]) -> Result<PathBuf, CommandError> {
    let tmp_path = temp_path(target);
    let mut file = File::create(&tmp_path).map_err(|err| {
        CommandError::io(
            "workspace_atomic_write_failed",
            "Workspace temp file cannot be created",
            err,
        )
    })?;
    file.write_all(content).map_err(|err| {
        CommandError::io(
            "workspace_atomic_write_failed",
            "Workspace temp file cannot be written",
            err,
        )
    })?;
    file.sync_all().map_err(|err| {
        CommandError::io(
            "workspace_atomic_write_failed",
            "Workspace temp file cannot be flushed",
            err,
        )
    })?;
    Ok(tmp_path)
}

fn commit_temp_file(tmp_path: &Path, target: &Path) -> Result<(), CommandError> {
    replace_file(tmp_path, target).map_err(|err| {
        let _ = fs::remove_file(tmp_path);
        CommandError::new(
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
