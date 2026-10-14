describe("Prettier provider startup", () => {
  let main, factory, implementation;

  beforeEach(async () => {
    main = (await lumine.packages.activatePackage("prettier")).mainModule;
    implementation = {
      canFormat: jasmine.createSpy("canFormat").and.resolveTo(true),
      formatEntireFile: jasmine.createSpy("formatEntireFile").and.resolveTo([]),
      formatCode: jasmine.createSpy("formatCode").and.resolveTo([]),
    };
    factory = spyOn(require("../lib/format-provider"), "createFormatProvider").and.returnValue(
      implementation,
    );
  });

  it("publishes one lightweight facade and creates its formatter on the first request", async () => {
    const file = main.provideCodeFormatFile();
    const range = main.provideCodeFormatRange();
    expect(file).toBe(range);
    expect(file.packageName).toBe("prettier");
    expect(file.priority).toBe(1);
    expect(factory).not.toHaveBeenCalled();

    const editor = {};
    const request = {};
    const selection = [
      [0, 0],
      [1, 0],
    ];
    expect(await file.canFormat(editor, request)).toBe(true);
    expect(await file.formatEntireFile(editor, request)).toEqual([]);
    expect(await range.formatCode(editor, selection, request)).toEqual([]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(implementation.canFormat).toHaveBeenCalledOnceWith(editor, request);
    expect(implementation.formatEntireFile).toHaveBeenCalledOnceWith(editor, request);
    expect(implementation.formatCode).toHaveBeenCalledOnceWith(editor, selection, request);
  });

  it("does not start a retired formatter when an old provider is called after reactivation", async () => {
    const retired = main.provideCodeFormatFile();
    await lumine.packages.deactivatePackage("prettier");
    main = (await lumine.packages.activatePackage("prettier")).mainModule;

    expect(main.provideCodeFormatFile()).not.toBe(retired);
    expect(await retired.canFormat({}, {})).toBe(false);
    expect(await retired.formatEntireFile({}, {})).toBeNull();
    expect(await retired.formatCode({}, [], {})).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });
});
