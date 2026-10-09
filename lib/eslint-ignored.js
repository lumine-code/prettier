const path = require("path");
const fs = require("fs");
const ignore = require("ignore");
const { findCachedFromFilePath, getDirFromFilePath } = require("./general");

const isFilePathEslintignored = (filePath, projectRoot) => {
  const ignorePath = findCachedFromFilePath(filePath, ".eslintignore", projectRoot);
  if (!ignorePath) return false;

  const ignoreDir = getDirFromFilePath(ignorePath);
  const relativePath =
    ignoreDir && filePath ? path.join(path.relative(ignoreDir, filePath)) : undefined;
  if (!relativePath) return false;

  let contents;
  try {
    contents = fs.readFileSync(ignorePath, "utf8");
  } catch {
    return false;
  }

  // Ignore files are ordered policies: a later !rule re-includes its match,
  // rather than independently excluding every path that does not match it.
  return ignore().add(contents).ignores(relativePath);
};

module.exports = isFilePathEslintignored;
