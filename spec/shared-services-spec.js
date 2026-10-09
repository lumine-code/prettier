const fs = require("fs");
const os = require("os");
const path = require("path");
const { Disposable, Task } = require("lumine");

describe("Prettier shared service ownership", () => {
  let main, directory, file, treeMain, tree, busyMain, linterMain, formatter, providers, tasks;
  function provide(name, payload) {
    const lease = lumine.packages.serviceHub.provide(name, "1.0.0", payload);
    providers.push(lease);
    return lease;
  }
  function dispatchSelected() {
    return lumine.commands.dispatch(lumine.workspace.getElement(), "prettier:format-selected");
  }
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "prettier-service-")));
    file = path.join(directory, "selected.js");
    fs.writeFileSync(file, "const sample=1;");
    lumine.project.setPaths([directory]);
    lumine.config.set("prettier.useGlobalPrettier", false);
    providers = [];
    tasks = [];
    // Replace the outer file-writing Task before any activation or command.
    spyOn(Task, "once").and.callFake((_worker, projects) => {
      tasks.push(projects);
      return { childProcess: { once() {} }, on: () => new Disposable(), terminate() {} };
    });
    treeMain = (await lumine.packages.activatePackage("tree-view")).mainModule;
    tree = treeMain.getTreeViewInstance();
    await tree.revealPath(file, { show: true });
    busyMain = (await lumine.packages.activatePackage("busy-signal")).mainModule;
    linterMain = (await lumine.packages.activatePackage("linter")).mainModule;
    formatter = (await lumine.packages.activatePackage("code-format")).mainModule;
    main = (await lumine.packages.activatePackage("prettier")).mainModule;
  });
  afterEach(async () => {
    for (const provider of providers) provider.dispose();
    await lumine.packages.deactivatePackage("prettier");
    lumine.project.setPaths([]);
    tree.updateRoots();
    await lumine.fileWatchClient.settlePendingTeardown();
    const relative = path.relative(fs.realpathSync.native(os.tmpdir()), directory);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new Error("Unsafe service fixture cleanup");
    }
    expect(fs.readFileSync(file, "utf8")).toBe("const sample=1;");
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("keeps real tree selection after one of two shared payload edges retires", async () => {
    const api = treeMain.provideTreeViewSelection();
    const first = provide("tree-view.selection", api);
    provide("tree-view.selection", api);
    first.dispose();
    await dispatchSelected();
    expect(tasks.length).toBe(1);
    expect(tasks[0]?.[0].files).toEqual([file]);
  });

  it("restores the older live tree selector when the newest edge retires", async () => {
    provide("tree-view.selection", treeMain.provideTreeViewSelection());
    const newer = provide("tree-view.selection", { selectedPaths: () => [] });
    newer.dispose();
    await dispatchSelected();
    expect(tasks.length).toBe(1);
  });

  it("keeps the real busy registry available after a shared payload edge retires", async () => {
    const api = busyMain.provideBusySignal();
    const first = provide("busy-signal", api);
    provide("busy-signal", api);
    first.dispose();
    await dispatchSelected();
    expect(tasks.length).toBe(1);
    expect(
      busyMain.instance.registry
        .getTilesActive()
        .some((entry) => entry.title.includes("prettier: Formatting")),
    ).toBe(true);
  });

  it("restores the older real executor when its replacement edge retires", async () => {
    const editor = await lumine.workspace.open();
    const older = formatter.provideCodeFormatExecutor();
    const newer = formatter.provideCodeFormatExecutor();
    // The actual frozen service objects are used; mock their common outer edit boundary.
    spyOn(formatter.manager, "formatEditor").and.resolveTo(true);
    provide("code-format.executor", older);
    const latest = provide("code-format.executor", newer);
    latest.dispose();
    await lumine.commands.dispatch(lumine.workspace.getElement(), "prettier:format");
    expect(formatter.manager.formatEditor).toHaveBeenCalledWith(editor, {
      provider: "prettier",
      reason: "manual",
    });
    editor.destroy();
  });

  it("retains real indie diagnostics when the same registry payload is consumed twice", () => {
    const api = linterMain.provideLinterRegistry();
    provide("linter.registry", api);
    const linterInterface = require(
      path.join(lumine.packages.getActivePackage("prettier").path, "lib/linter-interface"),
    );
    const delegate = linterInterface.get();
    linterInterface.report(
      { message: "Fixture error", loc: { line: 1, column: 1 } },
      { path: file },
    );
    expect(delegate.getMessages().length).toBe(1);
    provide("linter.registry", api);
    expect(linterInterface.get()).toBe(delegate);
    expect(linterInterface.get().getMessages().length).toBe(1);
  });

  it("restores the most recent surviving selection edge in A-B-A order", async () => {
    const a = treeMain.provideTreeViewSelection();
    provide("tree-view.selection", a);
    const b = provide("tree-view.selection", { selectedPaths: () => [] });
    const latest = provide("tree-view.selection", a);
    latest.dispose();
    await dispatchSelected();
    expect(tasks.length).toBe(0);
    b.dispose();
    await dispatchSelected();
    expect(tasks.length).toBe(1);
  });

  it("does not publish a staged old indie delegate over a reentrant replacement activation", () => {
    const api = linterMain.provideLinterRegistry();
    const linterInterface = require(
      path.join(lumine.packages.getActivePackage("prettier").path, "lib/linter-interface"),
    );
    let replacement, lease;
    provide("linter.registry", (options) => {
      const retired = api(options);
      // Exercise opaque factory cleanup/reentry through the actual bootstrap and Indie factory.
      main.deactivate();
      main.activate();
      lease = main.consumeLinterRegistry(api);
      replacement = linterInterface.get();
      return retired;
    });
    expect(linterInterface.get()).toBe(replacement);
    expect(replacement.subscriptions.disposed).toBe(false);
    lease.dispose();
  });
});
