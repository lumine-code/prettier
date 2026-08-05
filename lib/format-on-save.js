const { clearLinterErrors } = require("./linter-interface");
const { getBufferRange } = require("./editor-interface");
const { executePrettierOnBufferRange } = require("./execute-prettier");
const { attemptWithErrorNotification } = require("./app-interface");
const shouldFormatOnSave = require("./should-save");

const formatOnSaveIfAppropriate = async (editor) => {
  clearLinterErrors(editor);
  const shouldFormat = await shouldFormatOnSave(editor);
  if (shouldFormat) {
    await executePrettierOnBufferRange(editor, getBufferRange(editor), {
      refreshGitIndexAfterSave: true,
      setTextViaDiff: true,
    });
  }
};

const safeFormatOnSaveIfAppropriate = (editor) =>
  attemptWithErrorNotification(() => formatOnSaveIfAppropriate(editor));

module.exports = safeFormatOnSaveIfAppropriate;
