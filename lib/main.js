const path = require("path");
const fs = require("fs");
const { CompositeDisposable, Disposable, Task } = require("lumine");
const {
  createStatusTile,
  updateStatusTile,
  updateStatusTileScope,
  disposeTooltip,
} = require("./status-tile");
const linterInterface = require("./linter-interface");
const format = require("./manual-format");
const formatOnSave = require("./format-on-save");
const displayDebugInfo = require("./display-debug-info");
const { toggleFormatOnSave, shouldIgnoreNodeModules } = require("./app-interface");
const { getLocalOrGlobalPrettierPath } = require("./get-prettier-path");
const collectProjectFiles = require("./collect-project-files");
const { terminate: terminatePrettierWorker } = require("./prettier-service");
const { log } = require("./log");
const observedFiles = require("./observed-files");
const ObservedFilesList = require("./observed-list");
const ObservedFilesStatusView = require("./observed-status");

// local helpers
let subscriptions = null;
let statusBarHandler = null;
let statusBarRegistration = null;
let statusBarTile = null;
let statusTileSubscriptions = null;
let tileElement = null;
let busySignal = null;
let treeView = null;
let linterRegistration = null;
let observedFilesList = null;
let observedFilesStatusView = null;
let observedFilesStatusTile = null;

const getProjectPathForPath = (filePath) =>
  lumine.project.getPaths().find((projectPath) => {
    const relativePath = path.relative(projectPath, filePath);
    return (
      relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });

const getSelectedProjects = () => {
  if (!treeView || typeof treeView.selectedPaths !== "function") return [];

  const selectedPaths = treeView
    .selectedPaths()
    .filter(Boolean)
    .filter((selectedPath, index, paths) => paths.indexOf(selectedPath) === index)
    .filter((selectedPath) => {
      try {
        return fs.existsSync(selectedPath);
      } catch {
        return false;
      }
    });

  const projectsByPath = new Map();
  for (const selectedPath of selectedPaths) {
    const projectPath = getProjectPathForPath(selectedPath);
    if (!projectPath) {
      log("Format selected skipped outside project:", selectedPath);
      continue;
    }

    if (!projectsByPath.has(projectPath)) {
      projectsByPath.set(projectPath, { projectPath, targetPaths: [] });
    }
    projectsByPath.get(projectPath).targetPaths.push(selectedPath);
    log("Format selected target:", selectedPath, "project:", projectPath);
  }

  return Array.from(projectsByPath.values());
};

const buildFormatProjects = (projectItems, ignoreNodeModules) =>
  Promise.all(
    projectItems.map(async ({ projectPath, targetPaths }) => {
      const syntheticFilePath = path.join(projectPath, "__dummy__");
      const prettierPath = getLocalOrGlobalPrettierPath(syntheticFilePath, projectPath);
      return {
        projectPath,
        prettierPath: prettierPath || null,
        files: await collectProjectFiles(targetPaths || [projectPath], ignoreNodeModules),
      };
    }),
  );

const runFormatProjects = async (projectItems, label) => {
  if (!projectItems.length) {
    lumine.notifications.addInfo("prettier: No open projects.");
    return;
  }

  const ignoreNodeModules = shouldIgnoreNodeModules();
  const projects = await buildFormatProjects(projectItems, ignoreNodeModules);
  const targetCount = projects.reduce((count, project) => count + project.files.length, 0);

  let busyTitle = `prettier: Formatting ${targetCount} ${label}...`;
  const busyProvider =
    busySignal && typeof busySignal.create === "function" ? busySignal.create() : null;
  busyProvider?.add(busyTitle);

  let receivedResults = false;
  const taskPath = path.join(__dirname, "format-project-task.js");
  const task = Task.once(taskPath, projects, ignoreNodeModules, () => {
    if (receivedResults) return;
    busyProvider?.dispose();
    lumine.notifications.addWarning(`prettier: Format ${label} failed`, {
      dismissable: true,
      detail: "The format task finished without returning results.",
    });
  });

  const shouldUpdateProgressTitle = ({ current, total }) => {
    const isFirst = current === 1;
    const isLast = current === total;
    return isFirst || isLast;
  };

  task.on("prettier:format-progress", ({ projectPath, current, total }) => {
    if (busyProvider && shouldUpdateProgressTitle({ current, total })) {
      const action = current === total ? "Finished" : "Formatting";
      const nextTitle = `prettier: ${action} ${path.basename(projectPath)} (${total})`;
      busyProvider.changeTitle(nextTitle, busyTitle);
      busyTitle = nextTitle;
    }
  });

  task.on("prettier:format-done", ({ totalFormatted, totalErrored, errors }) => {
    receivedResults = true;
    busyProvider?.dispose();

    const summary = `Formatted ${totalFormatted} file(s), errors: ${totalErrored}`;
    if (totalErrored > 0) {
      const errorDetail = errors
        .slice(0, 20)
        .map((e) => `  ${e.filePath}: ${e.message}`)
        .join("\n");
      lumine.notifications.addWarning(`prettier: ${summary}`, {
        dismissable: true,
        detail: errorDetail + (errors.length > 20 ? "\n  ... and more" : ""),
      });
    } else {
      lumine.notifications.addSuccess(`prettier: ${summary}`, {
        dismissable: true,
      });
    }
  });
};

const runSelectedFormat = () => {
  const projectItems = getSelectedProjects();
  if (!projectItems.length) {
    lumine.notifications.addWarning("prettier: Format selected skipped", {
      detail: "Select one or more files or folders in the tree view first.",
      dismissable: true,
    });
    return;
  }

  log(
    "Format selected selections:",
    projectItems.flatMap((projectItem) => projectItem.targetPaths),
  );
  runFormatProjects(projectItems, "selected");
};

const updateObservedFilesStatus = () => {
  if (observedFilesStatusView) {
    observedFilesStatusView.setCount(observedFiles.getObservedCount());
  }
};

const showObservedFiles = () => {
  if (observedFilesList) {
    observedFilesList.show();
  }
};

const clearAllObservedFiles = () => {
  const count = observedFiles.clearObserved();
  if (count === 0) return;

  lumine.notifications.addInfo(`Cleared ${count} observed file${count === 1 ? "" : "s"}`);
};

const prepareEditorFormatting = () => lumine.packages.requestService("linter.registry", "^1.0.0");

const toggleObservedForActiveEditor = () => {
  const editor = lumine.workspace.getActiveTextEditor();
  const filePath = editor && editor.getPath();
  if (!filePath) {
    lumine.notifications.addWarning("prettier: Save the file before observing it.");
    return;
  }

  const observed = observedFiles.toggleObserved(filePath);
  const name = path.basename(filePath);
  lumine.notifications.addInfo(
    observed ? `Observing ${name} for format-on-save` : `Stopped observing ${name}`,
  );
};

const attachStatusTile = () => {
  if (statusBarHandler && !statusBarTile) {
    statusTileSubscriptions = new CompositeDisposable();
    tileElement = createStatusTile({ onToggleObserved: toggleObservedForActiveEditor });
    // Language-tooling band, see the priority convention in the status-bar
    // package README.
    statusBarTile = statusBarHandler.addLeftTile({
      item: tileElement,
      priority: 450,
    });
    updateStatusTile(statusTileSubscriptions, tileElement);

    statusTileSubscriptions.add(
      lumine.config.observe("prettier.formatOnSaveOptions.enabled", () =>
        updateStatusTile(statusTileSubscriptions, tileElement),
      ),
    );
    statusTileSubscriptions.add(
      lumine.workspace.onDidChangeActiveTextEditor((editor) =>
        updateStatusTileScope(tileElement, editor),
      ),
    );
  }
};

const detachStatusTile = () => {
  statusTileSubscriptions?.dispose();
  statusTileSubscriptions = null;
  disposeTooltip();
  if (statusBarTile) {
    statusBarTile.destroy();
    statusBarTile = null;
  }
};

const attachObservedFilesTile = () => {
  if (!statusBarHandler || observedFilesStatusTile || !observedFilesStatusView) return;

  // Observer band, see the priority convention in the status-bar package README.
  observedFilesStatusTile = statusBarHandler.addRightTile({
    item: observedFilesStatusView.getElement(),
    priority: 530,
  });
  updateObservedFilesStatus();
};

const detachObservedFilesTile = () => {
  if (observedFilesStatusTile) {
    observedFilesStatusTile.destroy();
    observedFilesStatusTile = null;
  }

  if (observedFilesStatusView) {
    observedFilesStatusView.destroy();
    observedFilesStatusView = null;
  }

  if (observedFilesList) {
    observedFilesList.destroy();
    observedFilesList = null;
  }
};

// public API
const activate = () => {
  subscriptions = new CompositeDisposable();

  observedFilesList = new ObservedFilesList();
  observedFilesStatusView = new ObservedFilesStatusView({
    onOpenObservedFiles: showObservedFiles,
    onClearObservedFiles: clearAllObservedFiles,
  });

  subscriptions.add(
    lumine.commands.add("lumine-workspace", "prettier:format", {
      description: "Format the whole of the active file.",
      didDispatch: async (event) => {
        // A right-click formats the editor it landed in, which is not always the
        // active one; the application menu and the palette dispatch at whatever
        // holds focus, so those fall back to the active editor.
        const clicked = lumine.workspace.getTextEditorForElement(event?.target, {
          includeMini: false,
        });
        const editor = clicked ?? lumine.workspace.getActiveTextEditor();
        if (editor) {
          await prepareEditorFormatting();
          return format(editor);
        }
      },
    }),
    lumine.commands.add("lumine-workspace", {
      "prettier:debug": {
        description: "Turn the package's debug logging on or off.",
        didDispatch: displayDebugInfo,
      },
      "prettier:show-diagnostics": {
        description: "Report which prettier and which config this file resolves to.",
        didDispatch: displayDebugInfo,
      },
      "prettier:toggle": {
        description: "Turn formatting on save on or off everywhere.",
        didDispatch: toggleFormatOnSave,
      },
      "prettier:toggle-observed": {
        description: "Format this one file on save, whatever the setting says.",
        didDispatch: toggleObservedForActiveEditor,
      },
      "prettier:observed-files": {
        description: "List the files formatted on save, and stop any of them.",
        didDispatch: showObservedFiles,
      },
      "prettier:clear-all-observed-files": {
        description: "Stop formatting every file that was set to format on save.",
        didDispatch: clearAllObservedFiles,
      },
      "prettier:format-projects": {
        description: "Format every supported file in the project folders.",
        didDispatch: () => {
          const projectItems = lumine.project.getPaths().map((projectPath) => ({ projectPath }));
          runFormatProjects(projectItems, "projects");
        },
      },
      // Not also on .tree-view: the tree view is inside the workspace, so a
      // dispatch from it reaches this handler on its own, and a second
      // registration would run runFormatProjects twice.
      "prettier:format-selected": {
        description: "Format only what is selected, leaving the rest alone.",
        didDispatch: runSelectedFormat,
      },
    }),
    lumine.workspace.observeTextEditors((editor) =>
      subscriptions.add(
        editor.getBuffer().onWillSave(async () => {
          if (!editor) return;
          await prepareEditorFormatting();
          return formatOnSave(editor);
        }),
      ),
    ),
    lumine.config.observe("prettier.formatOnSaveOptions.showInStatusBar", (show) =>
      show ? attachStatusTile() : detachStatusTile(),
    ),
    observedFiles.onDidChange(() => {
      updateObservedFilesStatus();
      if (observedFilesList) {
        observedFilesList.update();
      }
    }),
  );
};

const deactivate = () => {
  statusBarRegistration?.dispose();
  statusBarRegistration = null;
  linterRegistration?.dispose();
  linterRegistration = null;
  subscriptions.dispose();
  detachStatusTile();
  detachObservedFilesTile();
  observedFiles.clearObserved();
  terminatePrettierWorker();
};

const consumeStatusBar = (statusBar) => {
  statusBarRegistration?.dispose();
  statusBarHandler = statusBar;

  const showInStatusBar = lumine.config.get("prettier.formatOnSaveOptions.showInStatusBar");
  if (showInStatusBar) {
    attachStatusTile();
  }

  // The observed-file counter is independent of `showInStatusBar`: it hides
  // itself when nothing is observed, so it never adds noise on its own.
  attachObservedFilesTile();

  const registration = new Disposable(() => {
    if (statusBarHandler !== statusBar) return;
    detachStatusTile();
    detachObservedFilesTile();
    statusBarHandler = null;
    if (statusBarRegistration === registration) statusBarRegistration = null;
  });
  statusBarRegistration = registration;
  return registration;
};

const consumeBusySignal = (service) => {
  busySignal = service;
  return new Disposable(() => {
    if (busySignal === service) busySignal = null;
  });
};

const consumeTreeViewSelection = (service) => {
  treeView = service;
  return {
    dispose() {
      if (treeView === service) treeView = null;
    },
  };
};

const consumeLinterRegistry = (registerIndie) => {
  linterRegistration?.dispose();
  const linter = registerIndie({ name: "Prettier" });
  linterInterface.set(linter);
  const serviceSubscriptions = new CompositeDisposable(linter);

  // Setting and clearing messages per filePath
  serviceSubscriptions.add(
    lumine.workspace.observeTextEditors((textEditor) => {
      const editorPath = textEditor.getPath();
      if (!editorPath) {
        return;
      }

      const subscription = textEditor.onDidDestroy(() => {
        serviceSubscriptions.remove(subscription);
        linter.setMessages(editorPath, []);
      });
      serviceSubscriptions.add(subscription);
    }),
    new Disposable(() => {
      if (linterInterface.get() === linter) linterInterface.set(null);
      if (linterRegistration === serviceSubscriptions) linterRegistration = null;
    }),
  );
  linterRegistration = serviceSubscriptions;
  return serviceSubscriptions;
};

module.exports = {
  activate,
  deactivate,
  subscriptions,
  consumeStatusBar,
  consumeBusySignal,
  consumeTreeViewSelection,
  consumeLinterRegistry,
};
