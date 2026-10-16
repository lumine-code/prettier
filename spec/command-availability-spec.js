describe("Prettier command availability", () => {
  let main, editor, lease;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("prettier")).mainModule;
    editor = await lumine.workspace.open();
  });
  afterEach(async () => {
    lease?.dispose();
    editor.destroy();
    await lumine.packages.deactivatePackage("prettier");
    lease = null;
  });
  it("requires a saved editor and bound executor without executing a formatter", () => {
    const formatEditor = jasmine.createSpy("format");
    lease = main.consumeCodeFormatExecutor({ formatEditor });
    expect(lumine.commands.canDispatch(editor.element, "prettier:format")).toBe(false);
    spyOn(editor, "getPath").and.returnValue(__filename);
    expect(lumine.commands.canDispatch(editor.element, "prettier:format")).toBe(true);
    lease.dispose();
    expect(lumine.commands.canDispatch(editor.element, "prettier:format")).toBe(false);
    expect(formatEditor).not.toHaveBeenCalled();
  });
  it("declines project formatting with no roots", () => {
    spyOn(lumine.project, "getPaths").and.returnValue([]);
    expect(
      lumine.commands.canDispatch(lumine.workspace.getElement(), "prettier:format-projects"),
    ).toBe(false);
  });
  it("checks cached tree paths without resolving real project paths or scanning the selection", () => {
    const path = require("node:path");
    const root = path.join(process.cwd(), "cached-project");
    let selected = [path.join(root, "source.js")];
    spyOn(lumine.project, "getPaths").and.returnValue([root]);
    const resolve = spyOn(lumine.project, "relativizePath").and.throwError(
      "Availability must not resolve filesystem identities",
    );
    const scan = jasmine
      .createSpy("scan tree selection")
      .and.throwError("Availability must use the cached snapshot");
    lease = main.consumeTreeViewSelection({
      getSelectionSnapshot: () => ({ paths: selected }),
      selectedPaths: scan,
    });
    const tree = document.createElement("div");
    tree.className = "tree-view";
    expect(lumine.commands.canDispatch(tree, "prettier:format-selected")).toBeTrue();
    selected = [path.join(process.cwd(), "cached-project-sibling", "outside.js")];
    expect(lumine.commands.canDispatch(tree, "prettier:format-selected")).toBeFalse();
    selected = [path.join(root, "..legitimate-child", "source.js")];
    expect(lumine.commands.canDispatch(tree, "prettier:format-selected")).toBeTrue();
    expect(resolve).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
  });
});
