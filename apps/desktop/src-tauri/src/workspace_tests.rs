use crate::{
    workspace_file_io::{read_workspace_file_impl, write_workspace_file_impl},
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
    let write_error = write_workspace_file_impl(&root, "../outside.md", "unsafe")
        .expect_err("parent traversal should not write");

    assert_eq!(read_error.code, "workspace_path_outside_root");
    assert_eq!(write_error.code, "workspace_path_outside_root");
}

#[test]
fn lists_markdown_files_and_visible_directories_only() {
    let workspace = TestWorkspace::new("list");
    workspace.write("experiments/screen.chemd.md", "doc");
    workspace.write("notes.md", "note");
    workspace.write("ignore.txt", "ignored");
    workspace.write(".hidden/secret.chemd.md", "hidden");
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
}

#[test]
fn read_and_write_round_trip_inside_workspace() {
    let workspace = TestWorkspace::new("round-trip");
    let root = workspace.canonical_root();

    let write = write_workspace_file_impl(&root, "nested/result.chemd.md", "content")
        .expect("write should succeed");
    let read =
        read_workspace_file_impl(&root, "nested/result.chemd.md").expect("read should succeed");

    assert_eq!(write.path, "nested/result.chemd.md");
    assert_eq!(write.bytes, "content".len());
    assert_eq!(read.content, "content");
    assert_eq!(read.chemd_kind.as_deref(), Some("document"));
}

fn path_str(path: &Path) -> &str {
    path.to_str().expect("test path should be utf-8")
}
