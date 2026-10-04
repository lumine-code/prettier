const path = require("path");
const fs = require("fs");
const { CompositeDisposable, Disposable } = require("lumine");
let subscriptions,
  executorRegistration,
  executor,
  provider,
  busySignal,
  treeView,
  linterRegistration;
let activationGeneration = 0;
let activationController;
const tasks = new Map();

const getProjectPathForPath = (filePath) =>
  lumine.project.getPaths().find((projectPath) => {
    const relativePath = path.relative(projectPath, filePath);
    return (
      relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });

const getSelectedProjects = () => {
  if (!treeView || typeof treeView.selectedPaths !== "function") return [];
  const { log } = require("./log");

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
      const { getLocalOrGlobalPrettierPath } = require("./get-prettier-path");
      const collectProjectFiles = require("./collect-project-files");
      const syntheticFilePath = path.join(projectPath, "__dummy__");
      const prettierPath = await getLocalOrGlobalPrettierPath(
        syntheticFilePath,
        projectPath,
        lumine.config.get("prettier.useGlobalPrettier"),
      );
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

  const generation = activationGeneration;
  const { Task } = require("lumine");
  const { shouldIgnoreNodeModules } = require("./app-interface");
  const ignoreNodeModules = shouldIgnoreNodeModules();
  const projects = await buildFormatProjects(projectItems, ignoreNodeModules);
  if (generation !== activationGeneration) return;
  const targetCount = projects.reduce((count, project) => count + project.files.length, 0);

  let busyTitle = `prettier: Formatting ${targetCount} ${label}...`;
  const busyProvider =
    busySignal && typeof busySignal.create === "function" ? busySignal.create() : null;
  busyProvider?.add(busyTitle);

  let receivedResults = false;
  const taskPath = path.join(__dirname, "format-project-task.js");
  let task;
  const failTask = () => {
    if (receivedResults) return;
    receivedResults = true;
    tasks.delete(task);
    busyProvider?.dispose();
    if (generation === activationGeneration)
      lumine.notifications.addWarning(`prettier: Format ${label} failed`, {
        dismissable: true,
        detail: "The format task finished without returning results.",
      });
  };
  try {
    task = Task.once(taskPath, projects, ignoreNodeModules, failTask);
  } catch (error) {
    busyProvider?.dispose();
    throw error;
  }
  task.childProcess?.once("exit", failTask);
  task.childProcess?.once("error", failTask);
  tasks.set(task, busyProvider);
  const shouldUpdateProgressTitle = ({ current, total }) => {
    const isFirst = current === 1;
    const isLast = current === total;
    return isFirst || isLast;
  };

  task.on("prettier:format-progress", ({ projectPath, current, total }) => {
    if (generation !== activationGeneration) return;
    if (busyProvider && shouldUpdateProgressTitle({ current, total })) {
      const action = current === total ? "Finished" : "Formatting";
      const nextTitle = `prettier: ${action} ${path.basename(projectPath)} (${total})`;
      busyProvider.changeTitle(nextTitle, busyTitle);
      busyTitle = nextTitle;
    }
  });

  task.on("prettier:format-done", ({ totalFormatted, totalErrored, errors }) => {
    tasks.delete(task);
    if (generation !== activationGeneration) return;
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
    return Promise.resolve();
  }

  require("./log").log(
    "Format selected selections:",
    projectItems.flatMap((projectItem) => projectItem.targetPaths),
  );
  return runFormatProjects(projectItems, "selected");
};

const runOperation = (callback) => {
  const generation = activationGeneration;
  return Promise.resolve()
    .then(callback)
    .catch((error) => {
      if (generation === activationGeneration) reportFailure(error);
    });
};

const reportFailure = (error) => {
  if (error.name === "AbortError") return;
  lumine.notifications.addError("prettier: Formatting failed", {
    detail: error.message,
    dismissable: true,
  });
};

module.exports = {
  activate() {
    activationGeneration++;
    activationController = new AbortController();
    subscriptions = new CompositeDisposable(
      lumine.commands.add("lumine-workspace", {
        "prettier:format": {
          description: "Format the active file or selections using Prettier.",
          didDispatch: async (event) => {
            const editor =
              lumine.workspace.getTextEditorForElement(event?.target, { includeMini: false }) ??
              lumine.workspace.getActiveTextEditor();
            if (!editor) return;
            if (!executor) {
              lumine.notifications.addWarning("prettier: Enable code-format to format an editor.");
              return;
            }
            try {
              if (
                (await executor.formatEditor(editor, {
                  provider: "prettier",
                  reason: "manual",
                })) === false
              ) {
                lumine.notifications.addWarning("prettier: No formatter available for this file.");
              }
            } catch (error) {
              reportFailure(error);
            }
          },
        },
        "prettier:format-selected": {
          description: "Format only the selected project files and folders.",
          didDispatch: () => runOperation(runSelectedFormat),
        },
        "prettier:format-projects": {
          description: "Format every supported file in the project folders.",
          didDispatch: () =>
            runOperation(() =>
              runFormatProjects(
                lumine.project.getPaths().map((projectPath) => ({ projectPath })),
                "projects",
              ),
            ),
        },
        "prettier:show-diagnostics": {
          description: "Report which Prettier and config this file resolves to.",
          didDispatch: () =>
            require("./display-debug-info")({ signal: activationController.signal }),
        },
      }),
    );
  },
  deactivate() {
    activationGeneration++;
    activationController?.abort();
    subscriptions?.dispose();
    executorRegistration?.dispose();
    linterRegistration?.dispose();
    for (const [task, busyProvider] of tasks) {
      task.terminate();
      busyProvider?.dispose();
    }
    tasks.clear();
    require("./prettier-service").terminate();
    provider = null;
  },
  provideCodeFormatFile() {
    return this.formatProvider();
  },
  provideCodeFormatRange() {
    return this.formatProvider();
  },
  formatProvider() {
    if (!provider)
      provider = require("./format-provider").createFormatProvider({
        onError: require("./linter-interface").report,
        onSuccess: require("./linter-interface").clear,
      });
    return provider;
  },
  provideBackgroundTips() {
    return {
      packageName: "prettier",
      tips: [
        "You can format the current file with Prettier using {{ 'prettier:format' | keystroke }}",
      ],
    };
  },
  consumeCodeFormatExecutor(service) {
    executorRegistration?.dispose();
    executor = service;
    const registration = new Disposable(() => {
      if (executor === service) executor = null;
      if (executorRegistration === registration) executorRegistration = null;
    });
    executorRegistration = registration;
    return registration;
  },
  consumeBusySignal(service) {
    busySignal = service;
    return new Disposable(() => {
      if (busySignal === service) busySignal = null;
    });
  },
  consumeTreeViewSelection(service) {
    treeView = service;
    return new Disposable(() => {
      if (treeView === service) treeView = null;
    });
  },
  consumeLinterRegistry(registerIndie) {
    const linterInterface = require("./linter-interface");
    linterRegistration?.dispose();
    const linter = registerIndie({ name: "Prettier" });
    linterInterface.set(linter);
    const registration = new CompositeDisposable(
      linter,
      new Disposable(() => {
        if (linterInterface.get() === linter) linterInterface.set(null);
        if (linterRegistration === registration) linterRegistration = null;
      }),
    );
    registration.add(
      lumine.workspace.observeTextEditors((editor) => {
        let filePath = editor.getPath();
        const clear = () => {
          if (filePath) linter.setMessages(filePath, []);
        };
        const editorSubscriptions = new CompositeDisposable(
          editor.onDidChangePath(() => {
            clear();
            filePath = editor.getPath();
          }),
          editor.onDidDestroy(() => {
            clear();
            registration.remove(editorSubscriptions);
            editorSubscriptions.dispose();
          }),
        );
        registration.add(editorSubscriptions);
      }),
    );
    linterRegistration = registration;
    return registration;
  },
};
