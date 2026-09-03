const path = require("path");
const os = require("os");
const { Icon } = require("lumine");
const observedFiles = require("../lib/observed-files");
const ObservedFilesList = require("../lib/observed-list");

describe("prettier item actions", () => {
  let list, iconRegistration;

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
      .find((item) => item.getElement?.()?.classList.contains("prettier-observed-files-list"));
    list.hide();
  });

  afterEach(async () => {
    iconRegistration?.dispose();
    observedFiles.clearObserved();
    await lumine.packages.deactivatePackage("prettier");
  });

  it("routes observed file paths through the shared icon registry", async () => {
    const filePath = path.join(os.tmpdir(), "prettier-item-actions.js");
    observedFiles.setObserved(filePath, true);
    const observedList = new ObservedFilesList();
    await observedList.update();
    const line = observedList.selectList.getElement().querySelector(".primary-line");
    expect(line).toHaveClass("icon-file-text");

    iconRegistration = lumine.icons.addProvider(
      {
        id: "prettier-observed-files-spec",
        handles: ["path"],
        usesContext: true,
        iconFor(target) {
          return target.context === "prettier-observed-files" ? Icon.classes(["icon-flame"]) : null;
        },
      },
      { priority: 100 },
    );
    expect(line).toHaveClass("icon-flame");
    observedList.destroy();
  });

  it("derives its item and list actions from command registrations and the keymap", () => {
    const filePath = path.join(os.tmpdir(), "prettier-item-actions.js");
    observedFiles.setObserved(filePath, true);
    const actions = list.getAvailableActions();
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
    expect(open.primary).toBe(true);
    expect(open.context).toBe("item");

    const unobserve = byCommand.get("prettier:unobserve-selected-file");
    expect(unobserve.name).toBe("Unobserve Selected File");
    expect(unobserve.description).toBe(
      "Stop formatting the selected file on save and drop it from this list.",
    );
    expect(unobserve.keystrokes).toEqual(["ctrl-d"]);
    expect(unobserve.context).toBe("item");

    const clear = byCommand.get("prettier:clear-all-observed-files");
    expect(clear.description).toBe("Stop formatting every file that was set to format on save.");
    expect(clear.keystrokes).toEqual([]);
    expect(clear.context).toBe("dialog");
    expect(clear.tone).toBe("danger");
    expect(list.getItemId({ filePath })).toBe(filePath);
  });

  it("keeps only Clear All without a selection and hides it when the source is empty", () => {
    const filePath = path.join(os.tmpdir(), "prettier-item-actions.js");
    observedFiles.setObserved(filePath, true);
    list.setItems([]);

    expect(list.getAvailableActions().map((action) => action.command)).toEqual([
      "prettier:clear-all-observed-files",
    ]);

    observedFiles.clearObserved();
    expect(list.getAvailableActions()).toEqual([]);
  });

  it("shows the actions as a flow step and runs one against the master list", async () => {
    // Two observed files, so removing one keeps the list open.
    const fileA = path.join(os.tmpdir(), "prettier-item-actions-a.js");
    const fileB = path.join(os.tmpdir(), "prettier-item-actions-b.js");
    observedFiles.setObserved(fileA, true);
    observedFiles.setObserved(fileB, true);
    await list.show();

    await list.showActions();

    expect(lumine.workspace.getModalTrail()).toEqual(["Observed Files", "Actions"]);

    lumine.workspace.popModal();
    await list.runAction("prettier:unobserve-selected-file");

    expect(observedFiles.getObservedCount()).toBe(1);
    expect(list.isVisible()).toBeTruthy();
  });
});
