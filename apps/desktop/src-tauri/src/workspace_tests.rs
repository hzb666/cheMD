use crate::{
    workspace::{
        WorkspaceDocumentQueryOptions, WorkspaceIndexQueryOptions, WorkspaceIngestKnownRevision,
        WorkspaceIngestPlanOptions,
    },
    workspace_file_io::{
        content_hash, read_workspace_file_impl, set_before_workspace_commit_hook_for_test,
        write_workspace_file_impl, MAX_WORKSPACE_FILE_BYTES,
    },
    workspace_io::{
        build_workspace_ingest_plan_impl, canonical_workspace_root, list_workspace_files_impl,
        query_workspace_documents_impl, query_workspace_index_impl, workspace_handle,
    },
};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

struct TestWorkspace {
    root: PathBuf,
}

impl TestWorkspace {
    fn new(name: &str) -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("chemd-{name}-{suffix}"));
        fs::create_dir_all(&root).expect("temp workspace should be created");
        Self { root }
    }

    fn write(&self, relative: &str, content: &str) {
        let path = self.root.join(relative);
        fs::create_dir_all(path.parent().expect("file should have parent"))
            .expect("parent directory should be created");
        fs::write(path, content).expect("file should be written");
    }

    fn mkdir(&self, relative: &str) {
        fs::create_dir_all(self.root.join(relative)).expect("directory should be created");
    }

    fn canonical_root(&self) -> PathBuf {
        fs::canonicalize(&self.root).expect("root should canonicalize")
    }
}

impl Drop for TestWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn open_workspace_requires_existing_directory() {
    let workspace = TestWorkspace::new("open");
    let root = canonical_workspace_root(Some(path_str(&workspace.root))).expect("root is valid");
    let handle = workspace_handle(&root).expect("handle should be created");

    assert_eq!(
        handle.root_path,
        workspace.canonical_root().display().to_string()
    );
    assert!(handle.workspace_id.starts_with("workspace-"));
    assert!(!handle.display_name.is_empty());
}

#[test]
fn open_workspace_without_path_returns_displayable_error() {
    let error = canonical_workspace_root(None).expect_err("missing path should fail");

    assert_eq!(error.code, "workspace_not_selected");
    assert!(error.message.contains("No workspace"));
}

#[test]
fn rejects_parent_path_traversal_for_read_and_write() {
    let workspace = TestWorkspace::new("traversal");
    workspace.write("inside.chemd", "safe");
    let root = workspace.canonical_root();

    let read_error = read_workspace_file_impl(&root, "../outside.md")
        .expect_err("parent traversal should not read");
    let write_error = write_workspace_file_impl(&root, "../outside.md", "unsafe", None)
        .expect_err("parent traversal should not write");

    assert_eq!(read_error.code, "workspace_path_outside_root");
    assert_eq!(write_error.code, "workspace_path_outside_root");
}

#[test]
fn lists_workspace_tree_entries_without_expanding_heavy_dirs() {
    let workspace = TestWorkspace::new("list");
    workspace.write("experiments/screen.chemd", "doc");
    workspace.write("experiments/legacy.chemd.md", "legacy doc");
    workspace.write("notes.md", "note");
    workspace.write("ignore.txt", "listed");
    workspace.write(".hidden/secret.chemd", "hidden");
    workspace.write(".env", "DATABASE_URL=postgres://secret");
    workspace.write(".git/config", "heavy");
    workspace.write(".venv/bin/python", "heavy");
    workspace.write(".next/cache/chunk", "heavy");
    workspace.write("coverage/report.json", "heavy");
    workspace.write("build/output.js", "heavy");
    workspace.write("__pycache__/module.pyc", "heavy");
    workspace.mkdir("materials");

    let entries = list_workspace_files_impl("workspace-test", &workspace.canonical_root())
        .expect("workspace should list");
    let paths = entries
        .iter()
        .map(|entry| entry.path.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        paths,
        vec![
            "experiments",
            "experiments/legacy.chemd.md",
            "experiments/screen.chemd",
            "ignore.txt",
            "materials",
            "notes.md"
        ]
    );
    let screen = entries
        .iter()
        .find(|entry| entry.path == "experiments/screen.chemd")
        .expect("chemd file should be listed");
    assert_eq!(screen.kind, "file");
    assert_eq!(screen.chemd_kind.as_deref(), Some("document"));
    let legacy = entries
        .iter()
        .find(|entry| entry.path == "experiments/legacy.chemd.md")
        .expect("legacy chemd file should be listed");
    assert_eq!(legacy.chemd_kind.as_deref(), Some("document"));
    let asset = entries
        .iter()
        .find(|entry| entry.path == "ignore.txt")
        .expect("plain file should be listed");
    assert_eq!(asset.chemd_kind.as_deref(), Some("asset"));
    assert!(
        !entries.iter().any(|entry| {
            entry.path.starts_with('.')
                || entry.path.starts_with("coverage")
                || entry.path.starts_with("build")
                || entry.path.starts_with("__pycache__")
        }),
        "hidden and heavy metadata entries should be filtered"
    );
}

#[test]
fn lists_visible_entries_after_filtering_ignored_children() {
    let workspace = TestWorkspace::new("list-filtered-limit");
    for index in 0..300 {
        workspace.write(&format!(".ignored-{index}/secret.chemd"), "hidden");
    }
    workspace.write("visible.chemd", "doc");

    let entries = list_workspace_files_impl("workspace-test", &workspace.canonical_root())
        .expect("workspace should list");

    assert!(entries.iter().any(|entry| entry.path == "visible.chemd"));
    assert!(!entries.iter().any(|entry| entry.path.starts_with('.')));
}

#[test]
fn query_workspace_documents_filters_chemd_files_and_excludes_current_path() {
    let workspace = TestWorkspace::new("query-documents");
    workspace.write("experiments/alpha.chemd", "alpha");
    workspace.write("experiments/beta.chemd.md", "beta");
    workspace.write("notes.md", "note");
    workspace.write("assets/image.txt", "asset");

    let result = query_workspace_documents_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceDocumentQueryOptions {
            exclude_path: Some("experiments/alpha.chemd".into()),
            ..WorkspaceDocumentQueryOptions::default()
        },
    )
    .expect("workspace documents should query");

    assert_eq!(
        result
            .files
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>(),
        vec!["experiments/beta.chemd.md"]
    );
}

#[test]
fn query_workspace_documents_returns_limited_pages_with_next_cursor() {
    let workspace = TestWorkspace::new("query-documents-page");
    workspace.write("a.chemd", "a");
    workspace.write("b.chemd", "b");
    workspace.write("c.chemd", "c");

    let first_page = query_workspace_documents_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceDocumentQueryOptions {
            limit: Some(2),
            ..WorkspaceDocumentQueryOptions::default()
        },
    )
    .expect("first page should query");
    let second_page = query_workspace_documents_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceDocumentQueryOptions {
            cursor: first_page.next_cursor,
            limit: Some(2),
            ..WorkspaceDocumentQueryOptions::default()
        },
    )
    .expect("second page should query");

    assert_eq!(first_page.total_count, 3);
    assert_eq!(first_page.next_cursor, Some(2));
    assert_eq!(
        second_page
            .files
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>(),
        vec!["c.chemd"]
    );
}

#[test]
fn query_workspace_index_returns_paged_document_manifest_rows() {
    let workspace = TestWorkspace::new("query-index-page");
    workspace.write("a.chemd", "alpha");
    workspace.write("b.chemd.md", "beta");
    workspace.write("notes.md", "note");

    let first_page = query_workspace_index_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIndexQueryOptions {
            limit: Some(1),
            ..WorkspaceIndexQueryOptions::default()
        },
    )
    .expect("first index page should query");
    let second_page = query_workspace_index_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIndexQueryOptions {
            cursor: first_page.next_cursor,
            limit: Some(1),
            ..WorkspaceIndexQueryOptions::default()
        },
    )
    .expect("second index page should query");

    assert_eq!(first_page.summary.document_count, 2);
    assert_eq!(first_page.summary.total_count, 2);
    assert_eq!(first_page.summary.returned_count, 1);
    assert_eq!(first_page.next_cursor, Some(1));
    assert_eq!(first_page.rows[0].path, "a.chemd");
    assert_eq!(first_page.rows[0].bytes, 5);
    assert!(first_page.rows[0].modified_at_ms.is_some());
    assert!(first_page.rows[0].revision_key.starts_with("meta:5:"));
    assert_eq!(second_page.rows[0].path, "b.chemd.md");
    assert_eq!(second_page.next_cursor, None);
}

#[test]
fn query_workspace_index_filters_by_kind_query_and_document_path() {
    let workspace = TestWorkspace::new("query-index-filters");
    workspace.write("experiments/alpha.chemd", "alpha");
    workspace.write("experiments/beta.chemd", "beta");
    workspace.write("assets/image.txt", "asset");

    let by_query = query_workspace_index_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIndexQueryOptions {
            query: Some("beta".into()),
            ..WorkspaceIndexQueryOptions::default()
        },
    )
    .expect("index query should filter by text");
    let by_document_path = query_workspace_index_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIndexQueryOptions {
            document_path: Some("experiments\\alpha.chemd".into()),
            ..WorkspaceIndexQueryOptions::default()
        },
    )
    .expect("index query should normalize document path");
    let by_asset_kind = query_workspace_index_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIndexQueryOptions {
            kind: Some("asset".into()),
            ..WorkspaceIndexQueryOptions::default()
        },
    )
    .expect("index query should support explicit kind filters");

    assert_eq!(by_query.rows[0].path, "experiments/beta.chemd");
    assert_eq!(by_document_path.rows[0].path, "experiments/alpha.chemd");
    assert_eq!(by_asset_kind.rows[0].path, "assets/image.txt");
    assert_eq!(by_asset_kind.rows[0].chemd_kind.as_deref(), Some("asset"));
}

#[test]
fn build_workspace_ingest_plan_returns_paged_pending_and_skipped_items() {
    let workspace = TestWorkspace::new("ingest-plan-page");
    workspace.write("a.chemd", "alpha");
    workspace.write("b.chemd.md", "beta");
    workspace.write("notes.md", "note");
    workspace.write("image.txt", "asset");

    let first_page = build_workspace_ingest_plan_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIngestPlanOptions {
            limit: Some(2),
            ..WorkspaceIngestPlanOptions::default()
        },
    )
    .expect("first ingest plan page should build");
    let second_page = build_workspace_ingest_plan_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIngestPlanOptions {
            cursor: first_page.next_cursor,
            limit: Some(2),
            ..WorkspaceIngestPlanOptions::default()
        },
    )
    .expect("second ingest plan page should build");

    assert_eq!(first_page.summary.total_count, 3);
    assert_eq!(first_page.summary.returned_count, 2);
    assert_eq!(first_page.summary.pending_count, 2);
    assert_eq!(first_page.next_cursor, Some(2));
    assert_eq!(
        first_page
            .items
            .iter()
            .map(|item| item.path.as_str())
            .collect::<Vec<_>>(),
        vec!["a.chemd", "b.chemd.md"]
    );
    assert_eq!(second_page.items[0].path, "notes.md");
    assert_eq!(second_page.items[0].disposition, "skipped");
    assert_eq!(second_page.items[0].reason, "non_chemd_markdown");
    assert_eq!(second_page.next_cursor, None);
}

#[test]
fn build_workspace_ingest_plan_marks_known_revisions_unchanged() {
    let workspace = TestWorkspace::new("ingest-plan-known");
    workspace.write("a.chemd", "alpha");
    let initial = build_workspace_ingest_plan_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIngestPlanOptions::default(),
    )
    .expect("initial ingest plan should build");
    let known = initial.items[0].revision_key.clone();

    let unchanged = build_workspace_ingest_plan_impl(
        "workspace-test",
        &workspace.canonical_root(),
        &WorkspaceIngestPlanOptions {
            known_revisions: Some(vec![WorkspaceIngestKnownRevision {
                document_path: "a.chemd".into(),
                revision_key: known,
            }]),
            ..WorkspaceIngestPlanOptions::default()
        },
    )
    .expect("known ingest plan should build");

    assert_eq!(unchanged.items[0].disposition, "unchanged");
    assert_eq!(unchanged.items[0].reason, "revision_match");
    assert_eq!(unchanged.summary.unchanged_count, 1);
}

#[test]
fn read_and_write_reject_ignored_workspace_paths() {
    let workspace = TestWorkspace::new("ignored-read-write");
    workspace.write(".env", "DATABASE_URL=postgres://secret");
    workspace.write(".git/config", "secret");
    let root = workspace.canonical_root();

    let read_error =
        read_workspace_file_impl(&root, ".env").expect_err("sensitive file should not be readable");
    let write_error = write_workspace_file_impl(&root, ".git/config", "unsafe", None)
        .expect_err("vcs config should not be writable");

    assert_eq!(read_error.code, "workspace_path_ignored");
    assert_eq!(write_error.code, "workspace_path_ignored");
}

#[test]
fn read_and_write_round_trip_inside_workspace() {
    let workspace = TestWorkspace::new("round-trip");
    let root = workspace.canonical_root();

    let write = write_workspace_file_impl(&root, "nested/result.chemd", "content", None)
        .expect("write should succeed");
    let read = read_workspace_file_impl(&root, "nested/result.chemd").expect("read should succeed");

    assert_eq!(write.path, "nested/result.chemd");
    assert_eq!(write.bytes, "content".len());
    assert_eq!(write.content_hash, content_hash(b"content"));
    assert!(write.modified_at_ms.is_some());
    assert_eq!(read.content, "content");
    assert_eq!(read.content_hash, write.content_hash);
    assert!(read.modified_at_ms.is_some());
    assert_eq!(read.chemd_kind.as_deref(), Some("document"));
}

#[test]
fn write_accepts_matching_base_hash() {
    let workspace = TestWorkspace::new("base-match");
    workspace.write("doc.chemd", "old");
    let root = workspace.canonical_root();
    let base_hash = content_hash(b"old");

    let write = write_workspace_file_impl(&root, "doc.chemd", "new", Some(&base_hash))
        .expect("matching base hash should save");
    let read = read_workspace_file_impl(&root, "doc.chemd").expect("read should succeed");

    assert_eq!(write.content_hash, content_hash(b"new"));
    assert_eq!(read.content, "new");
    assert_eq!(read.content_hash, write.content_hash);
}

#[test]
fn write_rechecks_base_hash_immediately_before_commit() {
    let workspace = TestWorkspace::new("write-precommit-conflict");
    workspace.write("doc.chemd", "old");
    let root = workspace.canonical_root();
    let target = workspace.root.join("doc.chemd");
    let base_hash = content_hash(b"old");
    set_before_workspace_commit_hook_for_test(move || {
        fs::write(&target, "external").expect("external write should succeed");
    });

    let error = write_workspace_file_impl(&root, "doc.chemd", "local", Some(&base_hash))
        .expect_err("pre-commit external write should fail");
    let read = read_workspace_file_impl(&root, "doc.chemd").expect("read should succeed");
    let leaked_temp_files = fs::read_dir(&workspace.root)
        .expect("workspace root should be readable")
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
        .count();

    assert_eq!(error.code, "workspace_file_conflict");
    assert_eq!(read.content, "external");
    assert_eq!(leaked_temp_files, 0);
}

#[test]
fn write_rejects_oversized_external_file_before_base_hash() {
    let workspace = TestWorkspace::new("write-precommit-large-conflict");
    workspace.write("doc.chemd", "old");
    let root = workspace.canonical_root();
    let target = workspace.root.join("doc.chemd");
    let base_hash = content_hash(b"old");
    set_before_workspace_commit_hook_for_test(move || {
        fs::write(&target, "x".repeat(oversized_workspace_file_bytes()))
            .expect("external oversized write should succeed");
    });

    let error = write_workspace_file_impl(&root, "doc.chemd", "local", Some(&base_hash))
        .expect_err("oversized external file should fail before hashing");
    let leaked_temp_files = fs::read_dir(&workspace.root)
        .expect("workspace root should be readable")
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
        .count();

    assert_eq!(error.code, "workspace_file_too_large");
    assert_eq!(leaked_temp_files, 0);
}

#[test]
fn read_rejects_large_workspace_file() {
    let workspace = TestWorkspace::new("read-large");
    workspace.write("large.chemd", &"x".repeat(oversized_workspace_file_bytes()));
    let root = workspace.canonical_root();

    let error = read_workspace_file_impl(&root, "large.chemd")
        .expect_err("oversized files should not be read into the IDE");

    assert_eq!(error.code, "workspace_file_too_large");
}

#[test]
fn write_rejects_oversized_workspace_content() {
    let workspace = TestWorkspace::new("write-large");
    let root = workspace.canonical_root();

    let error = write_workspace_file_impl(
        &root,
        "large.chemd",
        &"x".repeat(oversized_workspace_file_bytes()),
        None,
    )
    .expect_err("oversized files should not be saved through the IDE");

    assert_eq!(error.code, "workspace_file_too_large");
    assert_eq!(error.detail.as_deref(), Some("large.chemd"));
}

#[test]
fn write_rejects_external_modification_conflict() {
    let workspace = TestWorkspace::new("base-conflict");
    workspace.write("doc.chemd", "old");
    let root = workspace.canonical_root();
    let base_hash = content_hash(b"old");
    workspace.write("doc.chemd", "external");

    let error = write_workspace_file_impl(&root, "doc.chemd", "local", Some(&base_hash))
        .expect_err("stale base hash should fail");
    let read = read_workspace_file_impl(&root, "doc.chemd").expect("read should succeed");

    assert_eq!(error.code, "workspace_file_conflict");
    assert!(error
        .detail
        .as_deref()
        .unwrap_or_default()
        .contains(&base_hash));
    assert_eq!(read.content, "external");
}

#[test]
fn write_conflict_cleans_temporary_file() {
    let workspace = TestWorkspace::new("base-conflict-cleanup");
    workspace.write("doc.chemd", "old");
    let root = workspace.canonical_root();
    let base_hash = content_hash(b"old");
    workspace.write("doc.chemd", "external");

    let error = write_workspace_file_impl(&root, "doc.chemd", "local", Some(&base_hash))
        .expect_err("stale base hash should fail");
    let leaked_temp_files = fs::read_dir(&workspace.root)
        .expect("workspace root should be readable")
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
        .count();

    assert_eq!(error.code, "workspace_file_conflict");
    assert_eq!(leaked_temp_files, 0);
}

#[test]
fn write_rejects_deleted_file_with_base_hash() {
    let workspace = TestWorkspace::new("base-deleted");
    workspace.write("doc.chemd", "old");
    let root = workspace.canonical_root();
    let base_hash = content_hash(b"old");
    fs::remove_file(workspace.root.join("doc.chemd")).expect("file should be removed");

    let error = write_workspace_file_impl(&root, "doc.chemd", "local", Some(&base_hash))
        .expect_err("deleted base file should fail");

    assert_eq!(error.code, "workspace_file_conflict");
    assert!(!workspace.root.join("doc.chemd").exists());
}

fn oversized_workspace_file_bytes() -> usize {
    usize::try_from(MAX_WORKSPACE_FILE_BYTES).expect("workspace file limit should fit usize") + 1
}

fn path_str(path: &Path) -> &str {
    path.to_str().expect("test path should be utf-8")
}
