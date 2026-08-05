const { runLinter } = require("./app-interface");
const { getCurrentFilePath } = require("./editor-interface");
const { getPrettierInstance } = require("./helpers");
const isFileFormattable = require("./is-file-formattable");
const handleError = require("./handle-error");
const { refreshGitIndexForFileAfterSave } = require("./refresh-git-index");

const executePrettierOnBufferRange = async (editor, bufferRange, options) => {
  const formattable = await isFileFormattable(editor);
  if (!formattable) return;

  const currentBuffer = editor.getBuffer();
  const cursorPosition = editor.getCursorBufferPosition();
  const textToTransform = editor.getTextInBufferRange(bufferRange);
  const cursorOffset = currentBuffer.characterIndexForPosition(cursorPosition);
  let results;

  if (!textToTransform) return;

  try {
    const prettier = getPrettierInstance(editor);
    const filePath = getCurrentFilePath(editor);
    const config = (await prettier.resolveConfig(filePath)) || {};
    results = await prettier.formatWithCursor(textToTransform, {
      cursorOffset,
      filepath: filePath,
      ...config,
    });
  } catch (error) {
    handleError({ editor, bufferRange, error });
    return;
  }

  if (options && options.refreshGitIndexAfterSave) {
    refreshGitIndexForFileAfterSave(editor, getCurrentFilePath(editor));
  }

  const isTextUnchanged = results.formatted === textToTransform;
  if (isTextUnchanged) return;

  if (options && options.setTextViaDiff) {
    currentBuffer.setTextViaDiff(results.formatted);
  } else {
    editor.setTextInBufferRange(bufferRange, results.formatted);
  }

  const nextCursorPosition = currentBuffer.positionForCharacterIndex(results.cursorOffset);

  editor.setCursorBufferPosition(nextCursorPosition);
  runLinter(editor);
};

module.exports = executePrettierOnBufferRange;
