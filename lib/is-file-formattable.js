const getPrettierInstance = require("./get-prettier-instance");
const { shouldIgnoreNodeModules, getProjectRootForFile } = require("./app-interface");
const { getCurrentFilePath, isCurrentFilePathDefined } = require("./editor-interface");
const { findCachedFromFilePath } = require("./general");

const isFileFormattable = async (editor) => {
  if (!editor || !isCurrentFilePathDefined(editor)) return false;

  const filePath = getCurrentFilePath(editor);
  const projectRoot = getProjectRootForFile(filePath);
  const ignorePath = findCachedFromFilePath(filePath, ".prettierignore", projectRoot);
  const prettier = getPrettierInstance(editor);
  const fileInfo = await prettier.getFileInfo(filePath, {
    withNodeModules: !shouldIgnoreNodeModules(),
    ignorePath,
  });

  return fileInfo && !fileInfo.ignored && !!fileInfo.inferredParser;
};

module.exports = isFileFormattable;
