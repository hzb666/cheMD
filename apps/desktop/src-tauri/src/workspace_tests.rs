use crate::{
    workspace_file_io::{content_hash, read_workspace_file_impl, write_workspace_file_impl},
    workspace_io::{canonical_workspace_root, list_workspace_files_impl, workspace_handle},
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
    workspace.write("inside.chemd.md", "safe");
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
    workspace.write("experiments/screen.chemd.md", "doc");
    workspace.write("notes.md", "note");
    workspace.write("ignore.txt", "listed");
    workspace.write(".hidden/secret.chemd.md", "hidden");
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
            "experiments/screen.chemd.md",
            "ignore.txt",
            "materials",
            "notes.md"
        ]
    );
    let screen = entries
        .iter()
        .find(|entry| entry.path == "experiments/screen.chemd.md")
        .expect("chemd file should be listed");
    assert_eq!(screen.kind, "file");
    assert_eq!(screen.chemd_kind.as_deref(), Some("document"));
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
        workspace.write(&format!(".ignored-{index}/secret.chemd.md"), "hidden");
    }
    workspace.write("visible.chemd.md", "doc");

    let entries = list_workspace_files_impl("workspace-test", &workspace.canonical_root())
        .expect("workspace should list");

    assert!(entries.iter().any(|entry| entry.path == "visible.chemd.md"));
    assert!(!entries.iter().any(|entry| entry.path.starts_with('.')));
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

    let write = write_workspace_file_impl(&root, "nested/result.chemd.md", "content", None)
        .expect("write should succeed");
    let read =
        read_workspace_file_impl(&root, "nested/result.chemd.md").expect("read should succeed");

    assert_eq!(write.path, "nested/result.chemd.md");
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
    workspace.write("doc.chemd.md", "old");
    let root = workspace.canonical_root();
    let base_hash = content_hash(b"old");

    let write = write_workspace_file_impl(&root, "doc.chemd.md", "new", Some(&base_hash))
        .expect("matching base hash should save");
    let read = read_workspace_file_impl(&root, "doc.chemd.md").expect("read should succeed");

    assert_eq!(write.content_hash, content_hash(b"new"));
    assert_eq!(read.content, "new");
    assert_eq!(read.content_hash, write.content_hash);
}

#[test]
fn write_rejects_external_modification_conflict() {
    let workspace = TestWorkspace::new("base-conflict");
    workspace.write("doc.chemd.md", "old");
    let root = workspace.canonical_root();
    let base_hash = content_hash(b"old");
    workspace.write("doc.chemd.md", "external");

    let error = write_workspace_file_impl(&root, "doc.chemd.md", "local", Some(&base_hash))
        .expect_err("stale base hash should fail");
    let read = read_workspace_file_impl(&root, "doc.chemd.md").expect("read should succeed");

    assert_eq!(error.code, "workspace_file_conflict");
    assert!(error
        .detail
        .as_deref()
        .unwrap_or_default()
        .contains(&base_hash));
    assert_eq!(read.content, "external");
}

#[test]
fn write_rejects_deleted_file_with_base_hash() {
    let workspace = TestWorkspace::new("base-deleted");
    workspace.write("doc.chemd.md", "old");
    let root = workspace.canonical_root();
    let base_hash = content_hash(b"old");
    fs::remove_file(workspace.root.join("doc.chemd.md")).expect("file should be removed");

    let error = write_workspace_file_impl(&root, "doc.chemd.md", "local", Some(&base_hash))
        .expect_err("deleted base file should fail");

    assert_eq!(error.code, "workspace_file_conflict");
    assert!(!workspace.root.join("doc.chemd.md").exists());
}

fn path_str(path: &Path) -> &str {
    path.to_str().expect("test path should be utf-8")
}
