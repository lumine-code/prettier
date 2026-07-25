const path = require("path");
const { execFileSync } = require("child_process");
const { findCached, findCachedFromFilePath } = require("./general");
const { log } = require("./log");

// prettier 3 uses index.cjs, prettier 2 uses index.js
const PRETTIER_INDEX_PATHS = [
  path.join("node_modules", "prettier", "index.cjs"),
  path.join("node_modules", "prettier", "index.js"),
];

let cachedNpmPath;
const getGlobalNpmModulesPath = () => {
  if (cachedNpmPath !== undefined) return cachedNpmPath;
  try {
    const prefix = execFileSync("npm", ["get", "prefix"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (
      process.platform === "win32" ||
      process.env.OSTYPE === "msys" ||
      process.env.OSTYPE === "cygwin"
    ) {
      cachedNpmPath = path.resolve(prefix, "node_modules");
    } else {
      cachedNpmPath = path.resolve(prefix, "lib/node_modules");
    }
  } catch {
    cachedNpmPath = "";
  }
  return cachedNpmPath;
};

let cachedYarnPath;
const getGlobalYarnModulesPath = () => {
  if (cachedYarnPath !== undefined) return cachedYarnPath;
  try {
    cachedYarnPath = execFileSync("yarn", ["global", "dir"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
  } catch {
    cachedYarnPath = "";
  }
  return cachedYarnPath;
};

const getGlobalPrettierPath = () => {
  const npmPath = getGlobalNpmModulesPath();
  const yarnPath = getGlobalYarnModulesPath();
  const found =
    findCached(npmPath, PRETTIER_INDEX_PATHS) || findCached(yarnPath, PRETTIER_INDEX_PATHS);
  if (found) {
    log("Global prettier found:", found);
  } else {
    log("Global prettier not found (npm:", npmPath, "yarn:", yarnPath + ")");
  }
  return found;
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

const getLocalOrGlobalPrettierPath = (filePath, projectRoot) => {
  const localPath = getLocalPrettierPath(filePath, projectRoot);
  if (localPath) return localPath;
  log("Trying global prettier...");
  return getGlobalPrettierPath();
};

module.exports = {
  getGlobalPrettierPath,
  getLocalPrettierPath,
  getLocalOrGlobalPrettierPath,
};
