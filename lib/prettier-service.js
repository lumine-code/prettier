const { fork } = require("child_process");
const path = require("path");
const { readBoundedFile } = require("./bounded-file");
const { log } = require("./log");
const { checkMessage, checkRequest, checkResult, budgetError } = require("./message-budget");

let child;
let nextId = 0;
const pending = new Map();

function ensureChild() {
  if (child) return child;
  const worker = fork(path.join(__dirname, "prettier-worker.js"), [], {
    silent: true,
    execArgv: ["--max-old-space-size=768"],
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
  worker.retire = (error) => {
    fail(error);
    worker.kill();
  };
  const retireAbandoned = () => {
    if (worker.abandoned && ![...pending.values()].some((request) => request.worker === worker))
      worker.retire(new Error("Prettier worker retired after cancellation."));
  };
  worker.retireAbandoned = retireAbandoned;
  worker.on("message", ({ id, result, error }) => {
    const p = pending.get(id);
    if (!p || p.worker !== worker) return;
    pending.delete(id);
    p.cleanup();
    if (error)
      p.reject(
        Object.assign(new Error(error.message ?? error), typeof error === "object" ? error : {}),
      );
    else {
      try {
        checkResult(p.method, result);
        checkMessage(result);
        p.resolve(result);
      } catch (failure) {
        p.reject(failure);
      }
    }
    retireAbandoned();
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
    checkRequest(method, args);
    const message = checkMessage({ id: nextId, method, args, prettierPath });
    if (pending.size >= 8) throw budgetError("Concurrent requests");
    const worker = ensureChild();
    const id = nextId++;
    const abort = () => {
      pending.delete(id);
      cleanup();
      reject(signal.reason);
      worker.abandoned = true;
      worker.retireAbandoned();
    };
    const timer = setTimeout(
      () => worker.retire(new Error("Prettier request exceeded 30 seconds.")),
      30000,
    );
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    pending.set(id, { resolve, reject, cleanup, worker, method });
    signal?.addEventListener("abort", abort, { once: true });
    try {
      worker.send(message, (error) => {
        if (!error || !pending.has(id)) return;
        pending.delete(id);
        cleanup();
        reject(error);
        worker.retireAbandoned();
      });
    } catch (error) {
      pending.delete(id);
      cleanup();
      reject(error);
      worker.retire(error);
    }
  });
}

function getVersionSync(prettierPath) {
  try {
    if (prettierPath) {
      const pkgPath = path.join(path.dirname(prettierPath), "package.json");
      return JSON.parse(readBoundedFile(pkgPath, 1024 * 1024).text).version;
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
