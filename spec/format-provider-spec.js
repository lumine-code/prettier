const path = require("path");
const { TextBuffer } = require("lumine");

describe("Prettier formatting provider", () => {
  let editor,
    engine,
    provider,
    resolveEngine,
    createFormatProvider,
    onError,
    onSuccess,
    projectPaths;
  const fixturePath = path.join(__dirname, "fixtures", "project", "messy.js");

  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };

  const snapshot = (options = {}) => {
    const text = editor.getText();
    const filePath = editor.getPath();
    return Object.freeze({
      text,
      path: filePath,
      reason: "command",
      signal: new AbortController().signal,
      isCurrent: () => editor.getText() === text && editor.getPath() === filePath,
      ...options,
    });
  };

  const applyToCopy = (text, edits) => {
    const buffer = new TextBuffer({ text });
    try {
      for (const edit of [...edits].sort((a, b) => b.oldRange.compare(a.oldRange)))
        buffer.setTextInRange(edit.oldRange, edit.newText);
      return buffer.getText();
    } finally {
      buffer.destroy();
    }
  };

  beforeEach(async () => {
    jasmine.useRealClock();
    projectPaths = lumine.project.getPaths();
    // This fixture is its own project. The package's .prettierignore excludes
    // spec/fixtures, which must not become this project's ignore policy merely
    // because another suite ran with a different set of project directories.
    lumine.project.setPaths([path.dirname(fixturePath)]);
    await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    // Use this package generation, including its worker after lifecycle tests.
    ({ createFormatProvider } = require("../lib/format-provider"));
    editor = await lumine.workspace.open(fixturePath);
    lumine.config.set("prettier.requireProjectDependency", false);
    lumine.config.set("prettier.requireConfig", false);
    lumine.config.set("prettier.respectEslintignore", false);
    lumine.config.set("prettier.ignoreNodeModules", true);
    engine = {
      getFileInfo: jasmine
        .createSpy("getFileInfo")
        .and.callFake(async () => ({ inferredParser: "babel", ignored: false })),
      resolveConfig: jasmine.createSpy("resolveConfig").and.callFake(async () => ({})),
      format: jasmine.createSpy("format").and.callFake(async (text) => text),
    };
    resolveEngine = jasmine.createSpy("resolveEngine").and.returnValue(engine);
    onError = jasmine.createSpy("onError");
    onSuccess = jasmine.createSpy("onSuccess");
    provider = createFormatProvider({ getPrettierInstance: resolveEngine, onError, onSuccess });
  });

  afterEach(() => {
    editor.destroy();
    require("../lib/prettier-service").terminate();
    lumine.project.setPaths(projectPaths);
  });

  it("returns a guarded file plan without changing text, selections or undo history", async () => {
    const source = "const  foo={a:1}\nmodule.exports=foo\n";
    const target = "const foo = { a: 1 };\nmodule.exports = foo;\n";
    editor.setText(source);
    editor.setSelectedBufferRanges([
      [
        [0, 7],
        [0, 10],
      ],
      [
        [1, 0],
        [1, 6],
      ],
    ]);
    editor.getBuffer().clearUndoStack();
    const selections = editor.getSelectedBufferRanges().map((range) => range.copy());
    const write = spyOn(editor, "setText").and.callThrough();
    const writeDiff = spyOn(editor.getBuffer(), "setTextViaDiff").and.callThrough();
    const moveCursor = spyOn(editor, "setCursorBufferPosition").and.callThrough();
    engine.format.and.returnValue(Promise.resolve(target));
    const request = snapshot();

    const result = await provider.formatEntireFile(editor, request);

    expect(result.text).toBe(target);
    expect(applyToCopy(source, result.edits)).toBe(target);
    expect(result.isCurrent()).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith(request);
    expect(editor.getText()).toBe(source);
    expect(editor.getSelectedBufferRanges()).toEqual(selections);
    expect(write).not.toHaveBeenCalled();
    expect(writeDiff).not.toHaveBeenCalled();
    expect(moveCursor).not.toHaveBeenCalled();
    editor.undo();
    expect(editor.getText()).toBe(source);
  });

  it("shares eligibility and config work across canFormat and the formatting request", async () => {
    const request = snapshot();
    expect(await provider.canFormat(editor, request)).toBe(true);
    expect(await provider.formatEntireFile(editor, request)).toEqual([]);
    expect(onSuccess).toHaveBeenCalledWith(request);
    expect(engine.getFileInfo).toHaveBeenCalledTimes(1);
    expect(engine.resolveConfig).toHaveBeenCalledTimes(1);
    expect(engine.getFileInfo.calls.mostRecent().args[2]).toBe(request.signal);
    expect(engine.resolveConfig.calls.mostRecent().args[1]).toBe(request.signal);
    expect(engine.format.calls.mostRecent().args[2]).toBe(request.signal);
    expect(engine.getFileInfo.calls.mostRecent().args[1].withNodeModules).toBe(false);
    expect(resolveEngine.calls.mostRecent().args[0].buffer.file.getPath()).toBe(request.path);
  });

  it("declines ignored or unsupported files without running the formatter", async () => {
    for (const fileInfo of [
      { inferredParser: "babel", ignored: true },
      { inferredParser: null, ignored: false },
    ]) {
      engine.getFileInfo.and.returnValue(Promise.resolve(fileInfo));
      const request = snapshot();
      expect(await provider.canFormat(editor, request)).toBe(false);
      expect(await provider.formatEntireFile(editor, request)).toBeNull();
    }
    expect(engine.resolveConfig).not.toHaveBeenCalled();
    expect(engine.format).not.toHaveBeenCalled();
  });

  it("declines an untitled buffer rather than guessing its parser from the grammar", async () => {
    const untitled = await lumine.workspace.open();
    try {
      const request = Object.freeze({
        text: untitled.getText(),
        path: undefined,
        signal: new AbortController().signal,
        isCurrent: () => true,
      });
      expect(await provider.canFormat(untitled, request)).toBe(false);
      expect(await provider.formatEntireFile(untitled, request)).toBeNull();
      expect(resolveEngine).not.toHaveBeenCalled();
    } finally {
      untitled.destroy();
    }
  });

  it("applies the project dependency and config requirements to provider eligibility", async () => {
    lumine.config.set("prettier.requireProjectDependency", true);
    expect(await provider.canFormat(editor, snapshot())).toBe(false);
    expect(resolveEngine).not.toHaveBeenCalled();

    lumine.config.set("prettier.requireProjectDependency", false);
    lumine.config.set("prettier.requireConfig", true);
    engine.resolveConfig.and.returnValue(Promise.resolve(null));
    expect(await provider.canFormat(editor, snapshot())).toBe(false);
    expect(engine.format).not.toHaveBeenCalled();
  });

  it("does not inspect or format an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = snapshot({ signal: controller.signal });
    expect(await provider.canFormat(editor, request)).toBe(false);
    expect(await provider.formatEntireFile(editor, request)).toBeNull();
    expect(resolveEngine).not.toHaveBeenCalled();
  });

  it("stops before worker requests when engine resolution finishes after cancellation", async () => {
    const controller = new AbortController();
    const request = snapshot({ signal: controller.signal });
    const pending = deferred();
    resolveEngine.and.returnValue(pending.promise);
    const result = provider.canFormat(editor, request);
    controller.abort();
    pending.resolve(engine);
    expect(await result).toBe(false);
    expect(engine.getFileInfo).not.toHaveBeenCalled();
    expect(engine.format).not.toHaveBeenCalled();
  });

  it("discards a stale formatting result before computing a diff", async () => {
    editor.setText("const  initial=1\n");
    const request = snapshot();
    const pending = deferred();
    engine.format.and.returnValue(pending.promise);
    const diff = spyOn(editor.getBuffer(), "getChangesToText").and.callThrough();
    expect(await provider.canFormat(editor, request)).toBe(true);
    const result = provider.formatEntireFile(editor, request);
    await flushMicrotasks();
    editor.setText("const  initial=1\nconst userAdded = 2\n");
    pending.resolve("const initial = 1;\n");

    expect(await result).toBeNull();
    expect(diff).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(editor.getText()).toContain("userAdded");
  });

  it("invalidates a completed plan when the path changes", async () => {
    editor.setText("const  foo=1\n");
    engine.format.and.returnValue(Promise.resolve("const foo = 1;\n"));
    const result = await provider.formatEntireFile(editor, snapshot());
    editor.getBuffer().setPath(path.join(path.dirname(fixturePath), "renamed.js"));
    expect(result.isCurrent()).toBe(false);
  });

  it("suppresses an aborted worker rejection and leaves the source alone", async () => {
    const controller = new AbortController();
    const request = snapshot({ signal: controller.signal });
    const pending = deferred();
    engine.format.and.returnValue(pending.promise);
    expect(await provider.canFormat(editor, request)).toBe(true);
    const result = provider.formatEntireFile(editor, request);
    await flushMicrotasks();
    controller.abort();
    pending.reject(new Error("Worker request aborted"));
    expect(await result).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(editor.getText()).toBe(request.text);
  });

  it("lets the hub report formatter failures instead of applying an empty result", async () => {
    const error = Object.assign(new SyntaxError("Parse failure"), { loc: { line: 2, column: 5 } });
    engine.format.and.callFake(async () => {
      throw error;
    });
    const request = snapshot();
    await expectAsync(provider.formatEntireFile(editor, request)).toBeRejectedWithError(
      "Parse failure",
    );
    expect(onError).toHaveBeenCalledWith(error, request);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("formats a range in the whole document using UTF-16 offsets and syntax context", async () => {
    const source = 'const emoji = "😀";\r\nfunction example() {\r\n  return {a:1,b:2}\r\n}\r\n';
    editor.setText(source);
    const service = require("../lib/prettier-service").createPrettierService();
    spyOn(service, "resolveConfig").and.returnValue(Promise.resolve({ endOfLine: "auto" }));
    const format = spyOn(service, "format").and.callThrough();
    provider = createFormatProvider({ getPrettierInstance: () => service });
    const range = [
      [2, 10],
      [2, 17],
    ];
    const edits = await provider.formatCode(editor, range, snapshot());

    expect(format.calls.mostRecent().args[0]).toBe(source);
    expect(format.calls.mostRecent().args[1].rangeStart).toBe(source.indexOf("a:1"));
    expect(format.calls.mostRecent().args[1].rangeEnd).toBe(source.indexOf("a:1") + 7);
    expect(format.calls.mostRecent().args[1].cursorOffset).toBeUndefined();
    expect(applyToCopy(source, edits)).toContain("return { a: 1, b: 2 };\r\n");
    expect(editor.getText()).toBe(source);
  }, 60000);

  it("remaps multiple selections after line expansion while leaving the middle unformatted", async () => {
    const source =
      "const  first={alpha:1,beta:2,gamma:3,delta:4}\n" +
      "const   untouched={b:2}\n" +
      "const  last={c:3}\n";
    editor.setText(source);
    const service = require("../lib/prettier-service").createPrettierService();
    spyOn(service, "resolveConfig").and.returnValue(Promise.resolve({ printWidth: 30 }));
    provider = createFormatProvider({ getPrettierInstance: () => service });
    const ranges = [
      [
        [0, 0],
        [0, editor.lineTextForBufferRow(0).length],
      ],
      [
        [2, 0],
        [2, editor.lineTextForBufferRow(2).length],
      ],
    ];
    const result = await provider.formatCode(editor, ranges[0], snapshot({ ranges }));

    expect(result.text).toContain("const first = {\n");
    expect(result.text).toContain("const   untouched={b:2}\n");
    expect(result.text).toContain("const last = { c: 3 };\n");
    expect(applyToCopy(source, result.edits)).toBe(result.text);
    expect(result.isCurrent()).toBe(true);
    expect(editor.getText()).toBe(source);
  }, 60000);
});
