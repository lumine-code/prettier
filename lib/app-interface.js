const path = require("path");

// constants
const LINTER_LINT_COMMAND = "linter:lint";

// local helpers
const getConfigOption = (key) => atom.config.get(`prettier.${key}`);

const setConfigOption = (key, value) => atom.config.set(`prettier.${key}`, value);

const isLinterLintCommandDefined = (editor) =>
  atom.commands
    .findCommands({ target: atom.views.getView(editor) })
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

const getEditorVersion = () => atom.getVersion();

const getPackageConfig = () => atom.config.get("prettier");

const getWhitelistedGlobs = () => getConfigOption("formatOnSaveOptions.whitelistedGlobs");

const getExcludedGlobs = () => getConfigOption("formatOnSaveOptions.excludedGlobs");

const addTooltip = (element, options) => atom.tooltips.add(element, options);

const addCompositeTooltip = (element, entries) => atom.tooltips.addComposite(element, entries);

const addInfoNotification = (message, options) => atom.notifications.addInfo(message, options);

const addWarningNotification = (message, options) =>
  atom.notifications.addWarning(message, options);

const addErrorNotification = (message, options) => atom.notifications.addError(message, options);

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
  atom.commands.dispatch(atom.views.getView(editor), LINTER_LINT_COMMAND);

const relativizePathFromProject = (filePath) => {
  if (filePath == null) return null;
  const [, relativePath] = atom.project.relativizePath(filePath);
  if (path.isAbsolute(relativePath)) {
    return path.relative(path.dirname(filePath), filePath);
  }
  return relativePath;
};

const getProjectRootForFile = (filePath) => {
  if (!filePath) return undefined;
  const [projectPath] = atom.project.relativizePath(filePath);
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
