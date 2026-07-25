// Child process that loads the real prettier (including import() for v3).
// Communicates with the main process via IPC messages.

const prettierCache = new Map();

function loadPrettier(prettierPath) {
  if (!prettierPath) prettierPath = "prettier-bundled";
  if (prettierCache.has(prettierPath)) return prettierCache.get(prettierPath);
  const p = require(prettierPath);
  prettierCache.set(prettierPath, p);
  return p;
}

process.on("message", async ({ id, method, args, prettierPath }) => {
  try {
    const prettier = loadPrettier(prettierPath);
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
    process.send({ id, error: e.message });
  }
});
