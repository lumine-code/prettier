const path = require("path");
const fs = require("fs");
const { findCachedFromFilePath, getDirFromFilePath, someGlobsMatchFilePath } = require("./helpers");

const LINE_SEPARATOR_REGEX = /(\r|\n|\r\n)/;

const isFilePathEslintignored = (filePath, projectRoot) => {
  const ignorePath = findCachedFromFilePath(filePath, ".eslintignore", projectRoot);
  if (!ignorePath) return false;

  const ignoreDir = getDirFromFilePath(ignorePath);
  const relativePath =
    ignoreDir && filePath ? path.join(path.relative(ignoreDir, filePath)) : undefined;
  if (!relativePath) return false;

  let lines;
  try {
    lines = fs.readFileSync(ignorePath, "utf8").split(LINE_SEPARATOR_REGEX);
  } catch {
    return false;
  }

  return someGlobsMatchFilePath(lines, relativePath);
};

module.exports = isFilePathEslintignored;
