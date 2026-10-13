// Child process that imports project-local or bundled Prettier engines.
// Communicates with the main process via IPC messages.

const prettierCache = new Map();
const { pathToFileURL } = require("node:url");

function loadPrettier(prettierPath) {
  const filename = require.resolve(prettierPath || "prettier-bundled");
  if (!prettierCache.has(filename)) {
    const pending = import(pathToFileURL(filename).href)
      .then((namespace) => namespace.default ?? namespace)
      .catch((error) => {
        prettierCache.delete(filename);
        throw error;
      });
    prettierCache.set(filename, pending);
  }
  return prettierCache.get(filename);
}

process.on("message", async ({ id, method, args, prettierPath }) => {
  try {
    const prettier = await loadPrettier(prettierPath);
    let result;
    switch (method) {
      case "format":
        result = await prettier.format(...args);
        break;
      case "formatWithCursor":
        result = await prettier.formatWithCursor(...args);
        break;
      case "resolveConfig":
        result = await prettier.resolveConfig(...args);
        break;
      case "getFileInfo":
        result = await prettier.getFileInfo(...args);
        break;
      case "getSupportInfo":
        result = await prettier.getSupportInfo();
        break;
      case "check":
        result = await prettier.check(...args);
        break;
      case "clearConfigCache":
        if (typeof prettier.clearConfigCache === "function") {
          prettier.clearConfigCache();
        }
        result = undefined;
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    process.send({ id, result });
  } catch (e) {
    process.send({ id, error: { message: e.message, name: e.name, stack: e.stack, loc: e.loc } });
  }
});
