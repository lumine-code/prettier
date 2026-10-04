const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const execute = promisify(exec);
const { findCached, findCachedFromFilePath } = require("./general");
const { log } = require("./log");

// prettier 3 uses index.cjs, prettier 2 uses index.js
const PRETTIER_INDEX_PATHS = [
  path.join("node_modules", "prettier", "index.cjs"),
  path.join("node_modules", "prettier", "index.js"),
];

let globalPath;
const getGlobalPrettierPath = () => {
  if (!globalPath)
    globalPath = (async () => {
      let npmPath = "",
        yarnPath = "";
      try {
        const { stdout } = await execute("npm prefix -g", { timeout: 5000, windowsHide: true });
        const prefix = stdout.trim();
        npmPath = path.join(prefix, process.platform === "win32" ? "" : "lib", "node_modules");
        const found = findCached(npmPath, ["prettier/index.cjs", "prettier/index.js"]);
        if (found) return found;
      } catch {
        /* An unavailable global package manager leaves the bundled fallback. */
      }
      try {
        const { stdout } = await execute("yarn global dir", { timeout: 5000, windowsHide: true });
        yarnPath = stdout.trim();
        const found = findCached(yarnPath, PRETTIER_INDEX_PATHS);
        if (found) return found;
      } catch {
        /* Yarn is optional. */
      }
      log("Global Prettier not found", npmPath, yarnPath);
      return undefined;
    })();
  return globalPath;
};

const getLocalPrettierPath = (filePath, projectRoot) => {
  log("Resolving prettier for:", filePath);
  const found = findCachedFromFilePath(filePath, PRETTIER_INDEX_PATHS, projectRoot);
  if (found) {
    log("Local prettier found:", found);
  } else {
    log("Local prettier not found for:", filePath);
  }
  return found;
};

const getLocalOrGlobalPrettierPath = async (filePath, projectRoot, useGlobal = false) => {
  const localPath = getLocalPrettierPath(filePath, projectRoot);
  if (localPath) return localPath;
  if (!useGlobal) return undefined;
  log("Trying global prettier...");
  return getGlobalPrettierPath();
};

module.exports = {
  getGlobalPrettierPath,
  getLocalPrettierPath,
  getLocalOrGlobalPrettierPath,
};
