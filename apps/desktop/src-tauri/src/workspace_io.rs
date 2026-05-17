use crate::workspace::{
    not_selected, CommandError, WorkspaceDocumentQueryOptions, WorkspaceDocumentQueryResult,
    WorkspaceFileEntry, WorkspaceHandle, WorkspaceIndexQueryOptions, WorkspaceIndexQueryResult,
    WorkspaceIndexRow, WorkspaceIndexSummary, WorkspaceIngestPlanItem, WorkspaceIngestPlanOptions,
    WorkspaceIngestPlanResult, WorkspaceIngestPlanSummary,
};
use crate::workspace_path::{chemd_kind_for_path, relative_path};
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

const MAX_DEPTH: usize = 6;
const MAX_ENTRIES: usize = 1_000;
const MAX_CHILDREN_PER_DIR: usize = 256;
const DEFAULT_DOCUMENT_QUERY_LIMIT: usize = 100;
const MAX_DOCUMENT_QUERY_LIMIT: usize = 250;
const DEFAULT_INDEX_QUERY_LIMIT: usize = 100;
const MAX_INDEX_QUERY_LIMIT: usize = 500;
const DEFAULT_INGEST_PLAN_LIMIT: usize = 100;
const MAX_INGEST_PLAN_LIMIT: usize = 500;
const IGNORED_DIRS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".turbo",
    ".ruff_cache",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
];
const SENSITIVE_FILES: &[&str] = &[
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".npmrc",
    ".pypirc",
];

pub(crate) fn canonical_workspace_root(root_path: Option<&str>) -> Result<PathBuf, CommandError> {
    let root_path = root_path
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(not_selected)?;
    let root = fs::canonicalize(root_path).map_err(|err| {
        CommandError::io(
            "workspace_not_found",
            "Workspace path cannot be opened",
            err,
        )
    })?;
    if !root.is_dir() {
        return Err(CommandError::new(
            "workspace_not_directory",
            "Workspace path is not a directory",
            Some(root.display().to_string()),
        ));
    }
    Ok(root)
}

pub(crate) fn workspace_handle(root: &Path) -> Result<WorkspaceHandle, CommandError> {
    let metadata = fs::metadata(root).map_err(|err| {
        CommandError::io(
            "workspace_unavailable",
            "Workspace metadata cannot be read",
            err,
        )
    })?;
    Ok(WorkspaceHandle {
        workspace_id: workspace_id_for_root(root),
        display_name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Workspace")
            .to_string(),
        root_path: root.display().to_string(),
        root_hint: root.display().to_string(),
        writable: !metadata.permissions().readonly(),
    })
}

pub(crate) fn list_workspace_files_impl(
    workspace_id: &str,
    root: &Path,
) -> Result<Vec<WorkspaceFileEntry>, CommandError> {
    let mut entries = Vec::new();
    visit_directory(workspace_id, root, root, 0, &mut entries)?;
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(entries)
}

pub(crate) fn query_workspace_documents_impl(
    workspace_id: &str,
    root: &Path,
    options: &WorkspaceDocumentQueryOptions,
) -> Result<WorkspaceDocumentQueryResult, CommandError> {
    let query = options
        .query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase);
    let exclude_path = options
        .exclude_path
        .as_deref()
        .map(normalize_workspace_path)
        .filter(|value| !value.is_empty());
    let cursor = options.cursor.unwrap_or(0);
    let limit = options
        .limit
        .unwrap_or(DEFAULT_DOCUMENT_QUERY_LIMIT)
        .clamp(1, MAX_DOCUMENT_QUERY_LIMIT);
    let files = list_workspace_files_impl(workspace_id, root)?;
    let matches = files
        .into_iter()
        .filter(is_chemd_document_entry)
        .filter(|entry| {
            exclude_path.as_deref().map_or(true, |excluded| {
                normalize_workspace_path(&entry.path) != excluded
            })
        })
        .filter(|entry| {
            query
                .as_deref()
                .map_or(true, |value| document_matches_query(entry, value))
        })
        .collect::<Vec<_>>();
    let total_count = matches.len();
    let files = matches
        .into_iter()
        .skip(cursor)
        .take(limit)
        .collect::<Vec<_>>();
    let next_cursor = (cursor + files.len() < total_count).then_some(cursor + files.len());
    Ok(WorkspaceDocumentQueryResult {
        files,
        total_count,
        next_cursor,
    })
}

pub(crate) fn query_workspace_index_impl(
    workspace_id: &str,
    root: &Path,
    options: &WorkspaceIndexQueryOptions,
) -> Result<WorkspaceIndexQueryResult, CommandError> {
    let query = normalized_query(options.query.as_deref());
    let kind = normalized_query(options.kind.as_deref());
    let document_path = options
        .document_path
        .as_deref()
        .map(normalize_workspace_path)
        .filter(|value| !value.is_empty());
    let cursor = options.cursor.unwrap_or(0);
    let limit = options
        .limit
        .unwrap_or(DEFAULT_INDEX_QUERY_LIMIT)
        .clamp(1, MAX_INDEX_QUERY_LIMIT);
    let files = list_workspace_files_impl(workspace_id, root)?;
    let document_count = files
        .iter()
        .filter(|entry| is_chemd_document_entry(entry))
        .count();
    let matches = files
        .into_iter()
        .filter(|entry| entry.kind == "file")
        .filter(|entry| {
            kind.as_deref()
                .map_or(true, |value| entry_matches_kind(entry, value))
        })
        .filter(|entry| {
            if kind.is_none() {
                is_chemd_document_entry(entry)
            } else {
                true
            }
        })
        .filter(|entry| {
            document_path
                .as_deref()
                .map_or(true, |path| normalize_workspace_path(&entry.path) == path)
        })
        .filter(|entry| {
            query
                .as_deref()
                .map_or(true, |value| document_matches_query(entry, value))
        })
        .collect::<Vec<_>>();
    let total_count = matches.len();
    let rows = matches
        .into_iter()
        .skip(cursor)
        .take(limit)
        .map(|entry| index_row(root, entry))
        .collect::<Result<Vec<_>, _>>()?;
    let next_cursor = (cursor + rows.len() < total_count).then_some(cursor + rows.len());
    let returned_count = rows.len();
    Ok(WorkspaceIndexQueryResult {
        rows,
        summary: WorkspaceIndexSummary {
            total_count,
            returned_count,
            document_count,
            cursor,
            limit,
        },
        next_cursor,
    })
}

pub(crate) fn build_workspace_ingest_plan_impl(
    workspace_id: &str,
    root: &Path,
    options: &WorkspaceIngestPlanOptions,
) -> Result<WorkspaceIngestPlanResult, CommandError> {
    let cursor = options.cursor.unwrap_or(0);
    let limit = options
        .limit
        .unwrap_or(DEFAULT_INGEST_PLAN_LIMIT)
        .clamp(1, MAX_INGEST_PLAN_LIMIT);
    let known_revisions = options
        .known_revisions
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|item| {
            (
                normalize_workspace_path(&item.document_path),
                item.revision_key.trim().to_string(),
            )
        })
        .collect::<std::collections::HashMap<_, _>>();
    let files = list_workspace_files_impl(workspace_id, root)?;
    let plan_entries = files
        .into_iter()
        .filter(|entry| entry.kind == "file")
        .filter(|entry| is_chemd_document_entry(entry) || is_plain_markdown_entry(entry))
        .collect::<Vec<_>>();
    let total_count = plan_entries.len();
    let items = plan_entries
        .into_iter()
        .skip(cursor)
        .take(limit)
        .map(|entry| ingest_plan_item(root, entry, &known_revisions))
        .collect::<Result<Vec<_>, _>>()?;
    let next_cursor = (cursor + items.len() < total_count).then_some(cursor + items.len());
    let returned_count = items.len();
    let pending_count = count_plan_disposition(&items, "pending");
    let unchanged_count = count_plan_disposition(&items, "unchanged");
    let skipped_count = count_plan_disposition(&items, "skipped");
    Ok(WorkspaceIngestPlanResult {
        items,
        summary: WorkspaceIngestPlanSummary {
            total_count,
            returned_count,
            pending_count,
            unchanged_count,
            skipped_count,
            cursor,
            limit,
        },
        next_cursor,
    })
}

fn visit_directory(
    workspace_id: &str,
    root: &Path,
    dir: &Path,
    depth: usize,
    entries: &mut Vec<WorkspaceFileEntry>,
) -> Result<(), CommandError> {
    if depth >= MAX_DEPTH || entries.len() >= MAX_ENTRIES {
        return Ok(());
    }

    let children = read_workspace_children(dir)?;
    if children.len() > MAX_CHILDREN_PER_DIR {
        return Ok(());
    }

    for child in children {
        if entries.len() >= MAX_ENTRIES {
            break;
        }
        let file_type = child.file_type().map_err(|err| {
            CommandError::io(
                "workspace_list_failed",
                "Workspace entry cannot be read",
                err,
            )
        })?;
        if file_type.is_symlink() {
            continue;
        }

        let path = child.path();
        let relative = relative_path(root, &path)?;
        if should_ignore_workspace_path(Path::new(&relative)) {
            continue;
        }
        if file_type.is_dir() {
            entries.push(file_entry(
                workspace_id,
                &path,
                &relative,
                "directory",
                None,
            ));
            visit_directory(workspace_id, root, &path, depth + 1, entries)?;
        } else if file_type.is_file() {
            entries.push(file_entry(
                workspace_id,
                &path,
                &relative,
                "file",
                chemd_kind_for_path(&path),
            ));
        }
    }
    Ok(())
}

fn read_workspace_children(dir: &Path) -> Result<Vec<fs::DirEntry>, CommandError> {
    let mut children = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|err| {
        CommandError::io(
            "workspace_list_failed",
            "Workspace directory cannot be read",
            err,
        )
    })?;

    for child in read_dir {
        let child = child.map_err(|err| {
            CommandError::io(
                "workspace_list_failed",
                "Workspace entry cannot be read",
                err,
            )
        })?;
        if should_ignore_name(&child.file_name()) {
            continue;
        }
        children.push(child);
        if children.len() > MAX_CHILDREN_PER_DIR {
            break;
        }
    }
    children.sort_by_key(|entry| entry.file_name());
    Ok(children)
}

fn is_chemd_document_entry(entry: &WorkspaceFileEntry) -> bool {
    entry.kind == "file"
        && (entry.chemd_kind.as_deref() == Some("document")
            || entry.path.ends_with(".chemd")
            || entry.path.ends_with(".chemd.md"))
}

fn is_plain_markdown_entry(entry: &WorkspaceFileEntry) -> bool {
    entry.kind == "file"
        && entry.path.to_ascii_lowercase().ends_with(".md")
        && !is_chemd_document_entry(entry)
}

fn document_matches_query(entry: &WorkspaceFileEntry, normalized_query: &str) -> bool {
    entry.name.to_ascii_lowercase().contains(normalized_query)
        || entry.path.to_ascii_lowercase().contains(normalized_query)
}

fn normalized_query(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
}

fn entry_matches_kind(entry: &WorkspaceFileEntry, kind: &str) -> bool {
    entry
        .chemd_kind
        .as_deref()
        .map(|value| value.eq_ignore_ascii_case(kind))
        .unwrap_or(false)
        || entry.kind.eq_ignore_ascii_case(kind)
}

fn normalize_workspace_path(path: &str) -> String {
    path.replace('\\', "/").trim_start_matches('/').to_string()
}

pub(crate) fn should_ignore_workspace_path(path: &Path) -> bool {
    path.components().any(|component| {
        let std::path::Component::Normal(name) = component else {
            return false;
        };
        should_ignore_name(name)
    })
}

fn should_ignore_name(name: &std::ffi::OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    let normalized = name.to_ascii_lowercase();
    normalized.starts_with('.')
        || IGNORED_DIRS.contains(&normalized.as_str())
        || SENSITIVE_FILES.contains(&normalized.as_str())
}

fn file_entry(
    workspace_id: &str,
    path: &Path,
    relative: &str,
    kind: &str,
    chemd_kind: Option<String>,
) -> WorkspaceFileEntry {
    WorkspaceFileEntry {
        id: format!("{workspace_id}:{relative}"),
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string(),
        path: relative.into(),
        kind: kind.into(),
        chemd_kind,
    }
}

fn index_row(root: &Path, entry: WorkspaceFileEntry) -> Result<WorkspaceIndexRow, CommandError> {
    let path = root.join(&entry.path);
    let metadata = fs::metadata(&path).map_err(|err| {
        CommandError::io(
            "workspace_index_metadata_failed",
            "Workspace index row metadata cannot be read",
            err,
        )
    })?;
    let modified_at_ms = modified_at_ms(&metadata);
    let bytes = metadata.len();
    Ok(WorkspaceIndexRow {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        chemd_kind: entry.chemd_kind,
        bytes,
        modified_at_ms,
        revision_key: revision_key(bytes, modified_at_ms),
    })
}

fn ingest_plan_item(
    root: &Path,
    entry: WorkspaceFileEntry,
    known_revisions: &std::collections::HashMap<String, String>,
) -> Result<WorkspaceIngestPlanItem, CommandError> {
    let row = index_row(root, entry)?;
    let normalized_path = normalize_workspace_path(&row.path);
    let is_document = row.chemd_kind.as_deref() == Some("document")
        || row.path.ends_with(".chemd")
        || row.path.ends_with(".chemd.md");
    let (disposition, reason) = if !is_document {
        ("skipped", "non_chemd_markdown")
    } else if known_revisions
        .get(&normalized_path)
        .map(|known| known == &row.revision_key)
        .unwrap_or(false)
    {
        ("unchanged", "revision_match")
    } else {
        ("pending", "revision_changed")
    };
    Ok(WorkspaceIngestPlanItem {
        id: row.id,
        name: row.name,
        path: row.path,
        chemd_kind: row.chemd_kind,
        bytes: row.bytes,
        modified_at_ms: row.modified_at_ms,
        revision_key: row.revision_key,
        disposition: disposition.into(),
        reason: reason.into(),
    })
}

fn count_plan_disposition(items: &[WorkspaceIngestPlanItem], disposition: &str) -> usize {
    items
        .iter()
        .filter(|item| item.disposition == disposition)
        .count()
}

fn revision_key(bytes: u64, modified_at_ms: Option<u64>) -> String {
    format!("meta:{}:{}", bytes, modified_at_ms.unwrap_or_default())
}

fn modified_at_ms(metadata: &fs::Metadata) -> Option<u64> {
    let modified = metadata.modified().ok()?;
    let millis = modified.duration_since(UNIX_EPOCH).ok()?.as_millis();
    Some(u64::try_from(millis).unwrap_or(u64::MAX))
}

pub(crate) fn workspace_id_for_root(root: &Path) -> String {
    let normalized = root.display().to_string().to_ascii_lowercase();
    let hash = normalized
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
    format!("workspace-{hash:016x}")
}
