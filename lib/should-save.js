const {
  getPrettierInstance,
  someGlobsMatchFilePath,
  isFileFormattable,
  isPrettierProperVersion,
} = require("./helpers");
const { getCurrentFilePath } = require("./editor-interface");
const {
  getExcludedGlobs,
  getWhitelistedGlobs,
  isFormatOnSaveEnabled,
  isDisabledIfNotInPackageJson,
  isDisabledIfNoConfigFile,
  relativizePathFromProject,
  shouldRespectEslintignore,
  getProjectRootForFile,
} = require("./app-interface");
const isFilePathEslintIgnored = require("./eslint-ignored");
const isPrettierInPackageJson = require("./prettier-in-pkg");
const observedFiles = require("./observed-files");

// Config-driven checks that decide *which* files the user wants formatted.
// An explicit per-file opt-in expresses that intent directly, so observed files
// skip these.
const passesConfiguredSelection = async (editor, filePath) => {
  if (!isFormatOnSaveEnabled()) return false;

  const relativePath = relativizePathFromProject(filePath);

  // Whitelist / blacklist glob checks
  const whitelistedGlobs = getWhitelistedGlobs();
  if (whitelistedGlobs && whitelistedGlobs.length > 0) {
    if (!someGlobsMatchFilePath(whitelistedGlobs, relativePath)) return false;
  } else {
    if (someGlobsMatchFilePath(getExcludedGlobs(), relativePath)) return false;
  }

  // Eslintignore check
  const projectRoot = getProjectRootForFile(filePath);
  if (shouldRespectEslintignore() && isFilePathEslintIgnored(filePath, projectRoot)) return false;

  // Package.json check
  if (isDisabledIfNotInPackageJson() && !isPrettierInPackageJson(editor)) return false;

  // Config file check
  if (isDisabledIfNoConfigFile()) {
    const prettier = getPrettierInstance(editor);
    const config = await prettier.resolveConfig(filePath);
    if (config == null) return false;
  }

  return true;
};

const shouldFormatOnSave = async (editor) => {
  const filePath = getCurrentFilePath(editor);
  if (!filePath) return false;

  if (!observedFiles.isObserved(filePath)) {
    if (!(await passesConfiguredSelection(editor, filePath))) return false;
  }

  // Checks below decide whether prettier *can* format the file at all, so they
  // apply to observed files too.

  // Version check
  if (!isPrettierProperVersion(editor)) return false;

  // Formattable check
  const formattable = await isFileFormattable(editor);
  return formattable;
};

module.exports = shouldFormatOnSave;
