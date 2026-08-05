const { getCurrentFilePath } = require("./editor-interface");
const { getLocalOrGlobalPrettierPath } = require("./get-prettier-path");
const { getProjectRootForFile } = require("./app-interface");
const { createPrettierService } = require("./prettier-service");
const { log } = require("./log");

// Cache services by prettier path so we reuse the same proxy object.
const serviceCache = new Map();

const getPrettierInstance = (editor) => {
  const filePath = getCurrentFilePath(editor);
  const projectRoot = getProjectRootForFile(filePath);
  const prettierPath = getLocalOrGlobalPrettierPath(filePath, projectRoot);
  const cacheKey = prettierPath || "__bundled__";

  if (!serviceCache.has(cacheKey)) {
    const service = createPrettierService(prettierPath || undefined);
    serviceCache.set(cacheKey, service);
    log("Prettier instance:", prettierPath || "bundled", "v" + service.version);
  }
  return serviceCache.get(cacheKey);
};

module.exports = getPrettierInstance;
