describe("Prettier service lifecycle", () => {
  let main;
  beforeEach(async () => {
    main = (await lumine.packages.activatePackage("prettier")).mainModule;
  });
  it("removes the linter delegate with its service edge", () => {
    const linterInterface = require("../lib/linter-interface");
    const linter = { dispose: jasmine.createSpy("dispose"), setMessages() {} };
    const registration = main.consumeLinterRegistry(() => linter);
    expect(linterInterface.get()).toBe(linter);
    registration.dispose();
    expect(linter.dispose).toHaveBeenCalled();
    expect(linterInterface.get()).toBeNull();
  });
  it("removes the executor edge without discarding a newer registration", async () => {
    const first = main.consumeCodeFormatExecutor({ formatEditor: () => Promise.resolve(true) });
    const secondService = { formatEditor: jasmine.createSpy("formatEditor").and.resolveTo(true) };
    const second = main.consumeCodeFormatExecutor(secondService);
    first.dispose();
    const editor = await lumine.workspace.open();
    const target = lumine.views.getView(lumine.workspace);
    lumine.commands.dispatch(target, "prettier:format");
    await Promise.resolve();
    expect(secondService.formatEditor).toHaveBeenCalledWith(editor, {
      provider: "prettier",
      reason: "manual",
    });
    second.dispose();
    lumine.commands.dispatch(target, "prettier:format");
    expect(
      lumine.notifications
        .getNotifications()
        .some((n) => n.getMessage().includes("Enable code-format")),
    ).toBe(true);
    editor.destroy();
  });
});
