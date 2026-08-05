const { executePrettierOnBufferRange } = require("./execute-prettier");
const { getBufferRange, getCurrentFilePath } = require("./editor-interface");
const { clearLinterErrors } = require("./linter-interface");
const { isPrettierProperVersion, isFileFormattable } = require("./helpers");
const { addWarningNotification } = require("./app-interface");
const path = require("path");

const format = async (editor) => {
  if (!isPrettierProperVersion(editor)) return;

  const formattable = await isFileFormattable(editor);
  if (!formattable) {
    const filePath = getCurrentFilePath(editor);
    const ext = filePath ? path.extname(filePath) : "unknown";
    addWarningNotification(`prettier: No parser found for "${ext}" files`, {
      dismissable: true,
    });
    return;
  }

  clearLinterErrors(editor);

  if (editor.getSelectedText()) {
    for (const bufferRange of editor.getSelectedBufferRanges()) {
      await executePrettierOnBufferRange(editor, bufferRange);
    }
  } else {
    await executePrettierOnBufferRange(editor, getBufferRange(editor));
  }
};

module.exports = format;
