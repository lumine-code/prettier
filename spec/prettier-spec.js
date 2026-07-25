const path = require("path");

const PROJECT_DIR = path.join(__dirname, "fixtures", "project");

describe("prettier", () => {
  let workspaceElement;

  async function pollUntil(condition, frames = 3000) {
    for (let i = 0; i < frames; i++) {
      if (condition()) return true;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return condition();
  }

  beforeEach(async () => {
    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);

    atom.project.setPaths([PROJECT_DIR]);

    // The package defers activation until the shell environment is loaded.
    atom.packages.triggerDeferredActivationHooks();
    atom.packages.triggerActivationHook("core:loaded-shell-environment");
    await atom.packages.activatePackage("prettier");
  });

  afterEach(() => {
    // Shut down the shared prettier worker process between specs.
    require("../lib/prettier-service").terminate();
  });

  describe("activation", () => {
    it("registers the workspace commands", () => {
      const commands = atom.commands
        .findCommands({ target: workspaceElement })
        .map((command) => command.name);

      expect(commands).toContain("prettier:format");
      expect(commands).toContain("prettier:format-projects");
      expect(commands).toContain("prettier:toggle");
      expect(commands).toContain("prettier:show-diagnostics");
    });
  });

  describe("prettier:toggle", () => {
    it("flips the format-on-save setting", () => {
      expect(atom.config.get("prettier.formatOnSaveOptions.enabled")).toBe(false);
      atom.commands.dispatch(workspaceElement, "prettier:toggle");
      expect(atom.config.get("prettier.formatOnSaveOptions.enabled")).toBe(true);
      atom.commands.dispatch(workspaceElement, "prettier:toggle");
      expect(atom.config.get("prettier.formatOnSaveOptions.enabled")).toBe(false);
    });
  });

  describe("prettier:format", () => {
    it("formats the active editor with the bundled Prettier", async () => {
      const editor = await atom.workspace.open(path.join(PROJECT_DIR, "messy.js"));
      const original = editor.getText();

      atom.commands.dispatch(workspaceElement, "prettier:format");

      const changed = await pollUntil(() => editor.getText() !== original);
      expect(changed).toBe(true);
      expect(editor.getText()).toBe("const foo = { a: 1 };\nmodule.exports = foo;\n");
    }, 60000);

    it("warns when no parser exists for the file type", async () => {
      await atom.workspace.open(path.join(PROJECT_DIR, "unknown.xyz"));
      atom.commands.dispatch(workspaceElement, "prettier:format");

      const warned = await pollUntil(() =>
        atom.notifications
          .getNotifications()
          .some((notification) => notification.getMessage().includes("No parser found")),
      );
      expect(warned).toBe(true);
    }, 60000);
  });

  describe("prettier:show-diagnostics", () => {
    it("shows a diagnostics notification", async () => {
      atom.commands.dispatch(workspaceElement, "prettier:show-diagnostics");

      const notified = await pollUntil(() =>
        atom.notifications
          .getNotifications()
          .some((notification) => notification.getMessage().includes("diagnostics")),
      );
      expect(notified).toBe(true);
    }, 60000);
  });
});
