const path = require("path");
const os = require("os");
const observedFiles = require("../lib/observed-files");

describe("prettier item actions", () => {
  let list;

  beforeEach(async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace));
    // The package defers activation until the shell environment is loaded.
    atom.packages.triggerDeferredActivationHooks();
    atom.packages.triggerActivationHook("core:loaded-shell-environment");
    await atom.packages.activatePackage("prettier");

    // The observed-files list is module-private: reach its view through the
    // modal panel that showing it creates.
    atom.commands.dispatch(atom.views.getView(atom.workspace), "prettier:observed-files");
    list = atom.workspace
      .getModalPanels()
      .map((panel) => panel.getItem())
      .find((item) => item.element?.classList.contains("prettier-observed-files-list"));
    list.hide();
  });

  afterEach(async () => {
    observedFiles.clearObserved();
    await atom.packages.deactivatePackage("prettier");
  });

  it("derives its action from the command registration and the keymap", () => {
    const actions = list.itemActions();

    expect(actions.map((action) => action.command)).toEqual(["prettier:unobserve-selected-file"]);
    const unobserve = actions[0];
    expect(unobserve.name).toBe("Unobserve Selected File");
    expect(unobserve.description).toBe(
      "Stop formatting the selected file on save and drop it from this list",
    );
    expect(unobserve.keystrokes).toEqual(["ctrl-d"]);
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
    expect(atom.workspace.getModalTrail()).toEqual(["Observed Files", "Actions"]);
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
