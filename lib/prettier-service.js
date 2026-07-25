const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");
const { log } = require("./log");

let child;
let nextId = 0;
const pending = new Map();

function ensureChild() {
  if (child) return child;
  child = fork(path.join(__dirname, "prettier-worker.js"), [], {
    silent: true,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "0",
      CHROME_LOG_FILE: process.platform === "win32" ? "nul" : "/dev/null",
    },
  });
  child.on("message", ({ id, result, error }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  });
  child.on("error", (err) => {
    log("Prettier child process error:", err.message);
    for (const [, p] of pending) {
      p.reject(err);
    }
    pending.clear();
    child = null;
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      log("Prettier child process exited with code:", code);
    }
    child = null;
  });
  return child;
}

function call(method, args, prettierPath) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ensureChild().send({ id, method, args, prettierPath });
  });
}

function getVersionSync(prettierPath) {
  try {
    if (prettierPath) {
      const pkgPath = path.join(path.dirname(prettierPath), "package.json");
      return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
    }
    return require("prettier-bundled/package.json").version;
  } catch {
    return "unknown";
  }
}

function createPrettierService(prettierPath) {
  return {
    format: (source, options) => call("format", [source, options], prettierPath),
    formatWithCursor: (source, options) =>
      call("formatWithCursor", [source, options], prettierPath),
    resolveConfig: (filePath) => call("resolveConfig", [filePath], prettierPath),
    getFileInfo: (filePath, options) => call("getFileInfo", [filePath, options], prettierPath),
    getSupportInfo: () => call("getSupportInfo", [], prettierPath),
    check: (source, options) => call("check", [source, options], prettierPath),
    clearConfigCache: () => {
      call("clearConfigCache", [], prettierPath);
    },
    version: getVersionSync(prettierPath),
  };
}

function terminate() {
  if (child) {
    child.kill();
    child = null;
  }
}

module.exports = { createPrettierService, terminate };
