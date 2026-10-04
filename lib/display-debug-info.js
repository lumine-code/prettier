const getPrettierInstance = require("./get-prettier-instance");
module.exports = async ({ signal } = {}) => {
  const editor = lumine.workspace.getActiveTextEditor();
  if (!editor) return;
  const filePath = editor.getPath();
  if (!filePath) {
    lumine.notifications.addWarning("prettier: Save the file to resolve its configuration.");
    return;
  }
  const current = () => !signal?.aborted && !editor.isDestroyed() && editor.getPath() === filePath;
  try {
    const prettier = await getPrettierInstance(filePath);
    if (!current()) return;
    const config = await prettier.resolveConfig(filePath, signal);
    if (!current()) return;
    lumine.notifications.addInfo("prettier: diagnostics", {
      detail:
        "File: " +
        filePath +
        "\nPrettier: " +
        prettier.version +
        "\nConfiguration: " +
        JSON.stringify(config, null, 2),
      dismissable: true,
    });
  } catch (error) {
    if (!current()) return;
    lumine.notifications.addError("prettier: Diagnostics failed", { detail: error.message });
  }
};
