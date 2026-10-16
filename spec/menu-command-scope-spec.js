describe("Prettier menu command scopes", () => {
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("prettier");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("prettier");
  });
  it("requires the handled editor or tree surface for formatting", async () => {
    const workspace = lumine.workspace.getElement();
    const editor = await lumine.workspace.open();
    editor.getBuffer().setPath(__filename);
    const main = lumine.packages.getActivePackage("prettier").mainModule;
    const executor = main.consumeCodeFormatExecutor({ formatEditor() {} });
    const selection = main.consumeTreeViewSelection({
      getSelectionSnapshot: () => ({ count: 1, paths: [__filename] }),
    });
    spyOn(lumine.project, "getPaths").and.returnValue([__dirname]);
    const tree = document.createElement("div");
    tree.className = "tree-view";
    workspace.appendChild(tree);
    try {
      expect(lumine.commands.canDispatch(workspace, "prettier:format")).toBe(false);
      expect(lumine.commands.canDispatch(editor.element, "prettier:format")).toBe(true);
      editor.setReadOnly(true);
      expect(lumine.commands.canDispatch(editor.element, "prettier:format")).toBe(false);
      expect(
        lumine.keymaps.findKeyBindings({ target: editor.element, command: "prettier:format" }),
      ).toEqual([]);
      expect(lumine.commands.canDispatch(editor.element, "prettier:format-selected")).toBe(false);
      expect(lumine.commands.canDispatch(tree, "prettier:format-selected")).toBe(true);
      expect(lumine.commands.canDispatch(workspace, "prettier:format-projects")).toBe(true);
    } finally {
      executor.dispose();
      selection.dispose();
      tree.remove();
      editor.destroy();
    }
  });
  it("declines unsaved diagnostics instead of borrowing another global editor", async () => {
    const editor = await lumine.workspace.open();
    const unrelated = lumine.workspace.buildTextEditor();
    unrelated.getBuffer().setPath(__filename);
    spyOn(lumine.workspace, "getActiveTextEditor").and.returnValue(unrelated);
    const warning = spyOn(lumine.notifications, "addWarning");
    try {
      expect(
        lumine.commands.dispatch(lumine.workspace.getElement(), "prettier:show-diagnostics"),
      ).toBeNull();
      expect(warning).not.toHaveBeenCalled();
    } finally {
      unrelated.destroy();
      editor.destroy();
    }
  });
});
