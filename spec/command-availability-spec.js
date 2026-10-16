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
});
