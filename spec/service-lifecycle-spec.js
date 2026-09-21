describe("Prettier service lifecycle", () => {
  let mainModule;

  beforeEach(async () => {
    const pack = await lumine.packages.activatePackage("prettier");
    mainModule = pack.mainModule;
  });

  it("removes the delegate and editor observers with the linter edge", () => {
    const linterInterface = require("../lib/linter-interface");
    const linter = {
      dispose: jasmine.createSpy("dispose"),
      setMessages() {},
    };
    const registration = mainModule.consumeLinterRegistry(() => linter);

    expect(linterInterface.get()).toBe(linter);
    registration.dispose();
    expect(linter.dispose).toHaveBeenCalled();
    expect(linterInterface.get()).toBeNull();
  });

  it("removes both status tiles with the status-bar edge", () => {
    lumine.config.set("prettier.formatOnSaveOptions.showInStatusBar", true);
    const tiles = [];
    const statusBar = {
      addLeftTile() {
        const tile = { destroy: jasmine.createSpy("destroy left tile") };
        tiles.push(tile);
        return tile;
      },
      addRightTile() {
        const tile = { destroy: jasmine.createSpy("destroy right tile") };
        tiles.push(tile);
        return tile;
      },
    };

    const registration = mainModule.consumeStatusBar(statusBar);
    expect(tiles.length).toBe(2);
    registration.dispose();
    expect(tiles.every((tile) => tile.destroy.calls.count() === 1)).toBe(true);
  });
});
