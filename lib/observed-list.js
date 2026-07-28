const path = require("path");
const observedFiles = require("./observed-files");

const VIEW_ID = "prettier.observed-files";

const HELP =
  "Available commands:\n" +
  "- **Enter**: Open file\n" +
  "- **Ctrl+D**: Stop observing selected file";

const displayPath = (filePath) => {
  const [projectPath, relativePath] = atom.project.relativizePath(filePath);
  if (projectPath && relativePath) {
    return relativePath;
  }
  return filePath;
};

const buildItems = () =>
  observedFiles.getObservedFiles().map((filePath) => ({
    filePath,
    displayPath: displayPath(filePath),
  }));

// The session, only while it is this view's. Anything else on screen belongs to
// another package and must not be refreshed or cancelled from here.
const ownSession = () => {
  const session = atom.modals.getActiveSession();
  return session && session.rootSpec.id === VIEW_ID ? session : null;
};

const show = () =>
  atom.modals.open({
    id: VIEW_ID,
    className: "prettier-observed-files-list",
    placeholder: "Observed format-on-save files...",
    emptyMessage: "No files observed for format-on-save",
    help: HELP,
    source: () => buildItems(),
    renderer: {
      // Two files can relativize to the same display path across projects, so
      // identity is the absolute path.
      entry: (item) => ({ id: item.filePath, text: item.displayPath }),
      row: (item) => ({ label: item.displayPath, icon: ["icon-file-code"] }),
    },
    actions: [
      {
        name: "unobserve-file",
        label: "Stop observing selected file",
        keystroke: "ctrl-d",
        run: ({ item }) => {
          observedFiles.setObserved(item.filePath, false);
          atom.notifications.addInfo(`Stopped observing ${path.basename(item.filePath)}`);
          // Unobserving the last file leaves nothing to pick, so close rather
          // than sit on an empty list.
          if (observedFiles.getObservedCount() === 0) return;
          return { keepOpen: true, refresh: true };
        },
      },
    ],
    confirm: ({ item }) => {
      // A query that matches nothing still confirms; there is no file to open.
      if (!item) return { keepOpen: true };
      atom.workspace.open(item.filePath, { searchAllPanes: true });
    },
  });

// Re-reads the store while the list is up: the set also changes from the status
// tile, `prettier:toggle-observed` and `prettier:clear-all-observed-files`.
const refresh = () => {
  const session = ownSession();
  if (session) session.refresh();
};

const hide = () => {
  const session = ownSession();
  if (session) session.cancel("api");
};

module.exports = { VIEW_ID, show, refresh, hide };
