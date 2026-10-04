const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");
const { log } = require("./log");

let child;
let nextId = 0;
const pending = new Map();

function ensureChild() {
  if (child) return child;
  const worker = fork(path.join(__dirname, "prettier-worker.js"), [], {
    silent: true,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "0",
      CHROME_LOG_FILE: process.platform === "win32" ? "nul" : "/dev/null",
    },
  });
  child = worker;
  worker.stdout?.resume();
  worker.stderr?.resume();
  const fail = (error) => {
    for (const [id, request] of pending) {
      if (request.worker !== worker) continue;
      pending.delete(id);
      request.cleanup();
      request.reject(error);
    }
    if (child === worker) child = null;
  };
  worker.on("message", ({ id, result, error }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    p.cleanup();
    if (error)
      p.reject(
        Object.assign(new Error(error.message ?? error), typeof error === "object" ? error : {}),
      );
    else p.resolve(result);
  });
  worker.on("error", (err) => {
    log("Prettier child process error:", err.message);
    fail(err);
  });
  worker.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      log("Prettier child process exited with code:", code);
    }
    fail(new Error(`Prettier worker exited (${code ?? "terminated"}).`));
  });
  return child;
}

function call(method, args, prettierPath, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = ensureChild();
    const id = nextId++;
    const abort = () => {
      pending.delete(id);
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    pending.set(id, { resolve, reject, cleanup, worker });
    signal?.addEventListener("abort", abort, { once: true });
    worker.send({ id, method, args, prettierPath }, (error) => {
      if (!error || !pending.has(id)) return;
      pending.delete(id);
      cleanup();
      reject(error);
    });
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
    format: (source, options, signal) => call("format", [source, options], prettierPath, signal),
    formatWithCursor: (source, options) =>
      call("formatWithCursor", [source, options], prettierPath),
    resolveConfig: (filePath, signal) => call("resolveConfig", [filePath], prettierPath, signal),
    getFileInfo: (filePath, options, signal) =>
      call("getFileInfo", [filePath, options], prettierPath, signal),
    getSupportInfo: () => call("getSupportInfo", [], prettierPath),
    check: (source, options) => call("check", [source, options], prettierPath),
    clearConfigCache: () => {
      return call("clearConfigCache", [], prettierPath);
    },
    version: getVersionSync(prettierPath),
  };
}

function terminate() {
  for (const request of pending.values()) {
    request.cleanup();
    request.reject(new Error("Prettier worker terminated."));
  }
  pending.clear();
  if (child) {
    child.kill();
    child = null;
  }
}

module.exports = { createPrettierService, terminate };
