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
});
