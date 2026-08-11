const path = require("path");

// constants
const LINTER_LINT_COMMAND = "linter:lint";

// local helpers
const getConfigOption = (key) => lumine.config.get(`prettier.${key}`);

const setConfigOption = (key, value) => lumine.config.set(`prettier.${key}`, value);

const isLinterLintCommandDefined = (editor) =>
  lumine.commands
    .findCommands({ target: lumine.views.getView(editor) })
    .some((command) => command.name === LINTER_LINT_COMMAND);

// public
const isFormatOnSaveEnabled = () => getConfigOption("formatOnSaveOptions.enabled");

const isDisabledIfNotInPackageJson = () =>
  getConfigOption("formatOnSaveOptions.isDisabledIfNotInPackageJson");

const isDisabledIfNoConfigFile = () =>
  getConfigOption("formatOnSaveOptions.isDisabledIfNoConfigFile");

const shouldRespectEslintignore = () => getConfigOption("formatOnSaveOptions.respectEslintignore");

const shouldIgnoreNodeModules = () => getConfigOption("formatOnSaveOptions.ignoreNodeModules");

const toggleFormatOnSave = () =>
  setConfigOption("formatOnSaveOptions.enabled", !isFormatOnSaveEnabled());

const getEditorVersion = () => lumine.application.getVersion();

const getPackageConfig = () => lumine.config.get("prettier");

const getWhitelistedGlobs = () => getConfigOption("formatOnSaveOptions.whitelistedGlobs");

const getExcludedGlobs = () => getConfigOption("formatOnSaveOptions.excludedGlobs");

const addTooltip = (element, options) => lumine.tooltips.add(element, options);

const addCompositeTooltip = (element, entries) => lumine.tooltips.addComposite(element, entries);

const addInfoNotification = (message, options) => lumine.notifications.addInfo(message, options);

const addWarningNotification = (message, options) =>
  lumine.notifications.addWarning(message, options);

const addErrorNotification = (message, options) => lumine.notifications.addError(message, options);

const attemptWithErrorNotification = async (func, ...args) => {
  try {
    await func(...args);
  } catch (e) {
    console.error(e);
    addErrorNotification(e.message, { dismissable: true, stack: e.stack });
  }
};

const runLinter = (editor) =>
  isLinterLintCommandDefined(editor) &&
  lumine.commands.dispatch(lumine.views.getView(editor), LINTER_LINT_COMMAND);

const relativizePathFromProject = (filePath) => {
  if (filePath == null) return null;
  const [, relativePath] = lumine.project.relativizePath(filePath);
  if (path.isAbsolute(relativePath)) {
    return path.relative(path.dirname(filePath), filePath);
  }
  return relativePath;
};

const getProjectRootForFile = (filePath) => {
  if (!filePath) return undefined;
  const [projectPath] = lumine.project.relativizePath(filePath);
  return projectPath || undefined;
};

module.exports = {
  addErrorNotification,
  addWarningNotification,
  getProjectRootForFile,
  addInfoNotification,
  addCompositeTooltip,
  addTooltip,
  getEditorVersion,
  getPackageConfig,
  getWhitelistedGlobs,
  getExcludedGlobs,
  isDisabledIfNotInPackageJson,
  isDisabledIfNoConfigFile,
  isFormatOnSaveEnabled,
  relativizePathFromProject,
  runLinter,
  shouldIgnoreNodeModules,
  shouldRespectEslintignore,
  toggleFormatOnSave,
  attemptWithErrorNotification,
};
