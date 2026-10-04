const getEditorVersion = () => lumine.application.getVersion();
const getPackageConfig = () => lumine.config.get("prettier");
const shouldIgnoreNodeModules = () => lumine.config.get("prettier.ignoreNodeModules");
const getProjectRootForFile = (filePath) =>
  filePath ? lumine.project.relativizePath(filePath)[0] || undefined : undefined;
const addInfoNotification = (message, options) => lumine.notifications.addInfo(message, options);
const addWarningNotification = (message, options) =>
  lumine.notifications.addWarning(message, options);
const addErrorNotification = (message, options) => lumine.notifications.addError(message, options);
module.exports = {
  getEditorVersion,
  getPackageConfig,
  shouldIgnoreNodeModules,
  getProjectRootForFile,
  addInfoNotification,
  addWarningNotification,
  addErrorNotification,
};
