const fs = require("fs");
const os = require("os");
const path = require("path");

describe("Prettier worker service", () => {
  let workerService, directory, enginePath;

  beforeEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    // Lifecycle specs unload package modules; acquire the current generation.
    workerService = require("../lib/prettier-service");
    workerService.terminate();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "prettier-worker-spec-"));
    enginePath = path.join(directory, "engine.cjs");
    fs.writeFileSync(
      enginePath,
      `const fs = require("fs");
module.exports = {
  format(source, options) {
    if (source === "pending") {
      fs.writeFileSync(options.filepath, "started");
      return new Promise(() => {});
    }
    return "formatted: " + source;
  }
};
`,
    );
  });

  afterEach(() => {
    workerService.terminate();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("abandons an executing request promptly when aborted and keeps later requests usable", async () => {
    const engine = workerService.createPrettierService(enginePath);
    const controller = new AbortController();
    const marker = path.join(directory, "aborted.started");
    const outcome = engine.format("pending", { filepath: marker }, controller.signal).then(
      () => null,
      (error) => error,
    );
    // The engine has begun an operation that will never answer. Cancellation
    // must settle independently of a worker response or a save timeout.
    await conditionPromise(() => fs.existsSync(marker));
    const reason = new Error("Request was superseded.");
    controller.abort(reason);

    expect(await outcome).toBe(reason);
    expect(await engine.format("next", {})).toBe("formatted: next");
  });

  it("rejects every outstanding request on termination and starts a clean replacement worker", async () => {
    const engine = workerService.createPrettierService(enginePath);
    const markers = ["first.started", "second.started"].map((name) => path.join(directory, name));
    const outcomes = markers.map((filepath) =>
      engine.format("pending", { filepath }).then(
        () => null,
        (error) => error,
      ),
    );
    await conditionPromise(() => markers.every((marker) => fs.existsSync(marker)));

    workerService.terminate();
    const next = engine.format("replacement", {});

    expect((await Promise.all(outcomes)).map((error) => error?.message)).toEqual([
      "Prettier worker terminated.",
      "Prettier worker terminated.",
    ]);
    expect(await next).toBe("formatted: replacement");
  });

  it("retains the real parser error location across worker IPC and still formats the next request", async () => {
    const engine = workerService.createPrettierService();
    const error = await engine.format("const =", { parser: "babel" }).then(
      () => null,
      (failure) => failure,
    );

    expect(error instanceof Error).toBe(true);
    expect(error.name).toBe("SyntaxError");
    expect(error.loc.start.line).toBe(1);
    expect(typeof error.loc.start.column).toBe("number");
    expect(error.message).toContain("Unexpected token");
    expect(await engine.format("const value=1", { parser: "babel" })).toBe("const value = 1;\n");
  });

  it("shares an ESM engine's asynchronous initialization across simultaneous requests", async () => {
    enginePath = path.join(directory, "engine # percent%.mjs");
    const marker = path.join(directory, "evaluations.txt");
    fs.writeFileSync(
      enginePath,
      `import fs from "node:fs";
const marker = new URL("./evaluations.txt", import.meta.url);
fs.appendFileSync(marker, "initialized\\n");
await new Promise(resolve => setTimeout(resolve, 30));
export async function format(source) { return "esm: " + source; }
`,
    );
    const engine = workerService.createPrettierService(enginePath);
    expect(await Promise.all([engine.format("one", {}), engine.format("two", {})])).toEqual([
      "esm: one",
      "esm: two",
    ]);
    expect(fs.readFileSync(marker, "utf8")).toBe("initialized\n");
  });

  it("recovers from a missing engine after the project provides it", async () => {
    const missing = path.join(directory, "installed-later.mjs");
    const engine = workerService.createPrettierService(missing);
    await expectAsync(engine.format("before", {})).toBeRejected();
    fs.writeFileSync(missing, 'export default { format: source => "installed: " + source };');
    expect(await engine.format("after", {})).toBe("installed: after");
  });

  it("settles cancellation while an ESM engine is still initializing", async () => {
    enginePath = path.join(directory, "gated-engine.mjs");
    const started = path.join(directory, "import.started");
    const ready = path.join(directory, "import.ready");
    fs.writeFileSync(
      enginePath,
      `import fs from "node:fs";
const ready = new URL("./import.ready", import.meta.url);
fs.writeFileSync(new URL("./import.started", import.meta.url), "started");
while (!fs.existsSync(ready)) await new Promise(resolve => setTimeout(resolve, 10));
export default { format: source => "ready: " + source };
`,
    );
    const engine = workerService.createPrettierService(enginePath);
    const controller = new AbortController();
    const pending = engine.format("old", {}, controller.signal).catch((error) => error);
    await conditionPromise(() => fs.existsSync(started));
    const reason = new Error("Formatting was cancelled during engine initialization.");
    controller.abort(reason);
    expect(await pending).toBe(reason);
    fs.writeFileSync(ready, "ready");
    expect(await engine.format("next", {})).toBe("ready: next");
  });
});
