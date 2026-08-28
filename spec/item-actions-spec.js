const path = require("path");
const os = require("os");
const observedFiles = require("../lib/observed-files");

describe("prettier item actions", () => {
  let list;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    // The package defers activation until the shell environment is loaded.
    lumine.packages.triggerDeferredActivationHooks();
    lumine.packages.triggerActivationHook("core:loaded-shell-environment");
    await lumine.packages.activatePackage("prettier");

    // The observed-files list is module-private: reach its view through the
    // modal panel that showing it creates.
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "prettier:observed-files");
    list = lumine.workspace
      .getModalPanels()
      .map((panel) => panel.getItem())
      .find((item) => item.element?.classList.contains("prettier-observed-files-list"));
    list.hide();
  });

  afterEach(async () => {
    observedFiles.clearObserved();
    await lumine.packages.deactivatePackage("prettier");
  });

  it("derives its item and list actions from command registrations and the keymap", () => {
    const filePath = path.join(os.tmpdir(), "prettier-item-actions.js");
    observedFiles.setObserved(filePath, true);
    const actions = list.itemActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    expect(actions.map((action) => action.command)).toEqual([
      "prettier:open-selected-file",
      "prettier:unobserve-selected-file",
      "prettier:clear-all-observed-files",
    ]);

    const open = byCommand.get("prettier:open-selected-file");
    expect(open.name).toBe("Open Selected File");
    expect(open.description).toBe(
      "Open the selected observed file, reusing its pane if it is already open.",
    );
    expect(open.keystrokes).toEqual(["enter"]);
    expect(open.scope).toBe("item");

    const unobserve = byCommand.get("prettier:unobserve-selected-file");
    expect(unobserve.name).toBe("Unobserve Selected File");
    expect(unobserve.description).toBe(
      "Stop formatting the selected file on save and drop it from this list.",
    );
    expect(unobserve.keystrokes).toEqual(["ctrl-d"]);
    expect(unobserve.scope).toBe("item");

    const clear = byCommand.get("prettier:clear-all-observed-files");
    expect(clear.description).toBe("Stop formatting every file that was set to format on save.");
    expect(clear.keystrokes).toEqual([]);
    expect(clear.scope).toBe("list");
    expect(list.getIdForItem({ filePath })).toBe(filePath);
  });

  it("keeps only Clear All without a selection and hides it when the source is empty", () => {
    const filePath = path.join(os.tmpdir(), "prettier-item-actions.js");
    observedFiles.setObserved(filePath, true);
    list.update({ items: [] });

    expect(list.itemActions().map((action) => action.command)).toEqual([
      "prettier:clear-all-observed-files",
    ]);

    observedFiles.clearObserved();
    expect(list.itemActions()).toEqual([]);
  });

  it("shows the actions as a flow step and runs one against the master list", async () => {
    // Two observed files, so removing one keeps the list open.
    const fileA = path.join(os.tmpdir(), "prettier-item-actions-a.js");
    const fileB = path.join(os.tmpdir(), "prettier-item-actions-b.js");
    observedFiles.setObserved(fileA, true);
    observedFiles.setObserved(fileB, true);
    list.show();

    await list.showItemActions();

    expect(list.itemActionsList.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["Observed Files", "Actions"]);
    // The actions list wears the package class, so the package keymap
    // resolves action keystrokes inside it too.
    expect(list.itemActionsList.element.classList.contains("prettier-observed-files-list")).toBe(
      true,
    );

    const index = list.itemActionsList.items.findIndex(
      (item) => item.command === "prettier:unobserve-selected-file",
    );
    list.itemActionsList.selectIndex(index);
    list.itemActionsList.confirmSelection();

    expect(observedFiles.getObservedCount()).toBe(1);
    expect(list.isVisible()).toBeTruthy();
    expect(list.itemActionsList.isVisible()).toBeFalsy();
  });
});
