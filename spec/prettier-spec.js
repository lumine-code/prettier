const path = require("path");
const fs = require("fs");
const os = require("os");

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
      expect(commands).toContain("prettier:toggle-observed");
      expect(commands).toContain("prettier:observed-files");
      expect(commands).toContain("prettier:clear-all-observed-files");
    });
  });

  describe("observed files", () => {
    let observedFiles, tempDir;

    function writeTempFile(name, contents) {
      const filePath = path.join(tempDir, name);
      fs.writeFileSync(filePath, contents);
      return filePath;
    }

    beforeEach(() => {
      observedFiles = require("../lib/observed-files");
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prettier-spec-"));
    });

    afterEach(() => {
      observedFiles.clearObserved();
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Windows can refuse to delete a directory whose files were just saved.
      }
    });

    it("toggles the active file on and off", async () => {
      const filePath = writeTempFile("toggle.js", "const a = 1;\n");
      await atom.workspace.open(filePath);

      atom.commands.dispatch(workspaceElement, "prettier:toggle-observed");
      expect(observedFiles.isObserved(filePath)).toBe(true);

      atom.commands.dispatch(workspaceElement, "prettier:toggle-observed");
      expect(observedFiles.isObserved(filePath)).toBe(false);
    });

    it("keeps the opt-in after the file's editor is destroyed", async () => {
      const filePath = writeTempFile("closed.js", "const a = 1;\n");
      const editor = await atom.workspace.open(filePath);
      observedFiles.setObserved(filePath, true);

      editor.destroy();

      expect(observedFiles.isObserved(filePath)).toBe(true);
    });

    it("clears every observed file at once", () => {
      observedFiles.setObserved(writeTempFile("one.js", ""), true);
      observedFiles.setObserved(writeTempFile("two.js", ""), true);
      expect(observedFiles.getObservedCount()).toBe(2);

      atom.commands.dispatch(workspaceElement, "prettier:clear-all-observed-files");

      expect(observedFiles.getObservedCount()).toBe(0);
    });

    it("formats an observed file on save while format-on-save is disabled", async () => {
      atom.config.set("prettier.formatOnSaveOptions.enabled", false);
      const filePath = writeTempFile("observed.js", "const  foo   = {a:1}\n");
      const editor = await atom.workspace.open(filePath);
      observedFiles.setObserved(filePath, true);

      await editor.save();

      expect(editor.getText()).toBe("const foo = { a: 1 };\n");
    }, 60000);

    it("leaves an unobserved file untouched on save", async () => {
      atom.config.set("prettier.formatOnSaveOptions.enabled", false);
      const filePath = writeTempFile("plain.js", "const  bar   = {a:1}\n");
      const editor = await atom.workspace.open(filePath);

      await editor.save();

      expect(editor.getText()).toBe("const  bar   = {a:1}\n");
    }, 60000);

    it("still skips a file Prettier has no parser for", async () => {
      atom.config.set("prettier.formatOnSaveOptions.enabled", false);
      const filePath = writeTempFile("observed.xyz", "const  baz   = {a:1}\n");
      const editor = await atom.workspace.open(filePath);
      observedFiles.setObserved(filePath, true);

      await editor.save();

      expect(editor.getText()).toBe("const  baz   = {a:1}\n");
    }, 60000);
  });

  describe("prettier:observed-files", () => {
    let modals, observedFiles, tempDir;

    function writeTempFile(name) {
      const filePath = path.join(tempDir, name);
      fs.writeFileSync(filePath, "const a = 1;\n");
      return filePath;
    }

    async function openList() {
      atom.commands.dispatch(workspaceElement, "prettier:observed-files");
      await modals.settle();
    }

    beforeEach(() => {
      // The shared modal vocabulary lives in the editor checkout, which sits at
      // a different depth relative to this package in the workspace than it
      // does in CI, so resolve it through the running editor instead.
      modals = require(
        path.join(atom.getLoadSettings().resourcePath, "spec", "helpers", "modal-helpers"),
      );
      observedFiles = require("../lib/observed-files");
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prettier-spec-"));
    });

    afterEach(async () => {
      if (atom.modals.isOpen()) {
        modals.cancel();
        await modals.settle();
      }
      observedFiles.clearObserved();
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Windows can refuse to delete a directory whose files were just saved.
      }
    });

    it("lists every observed file", async () => {
      const one = writeTempFile("one.js");
      const two = writeTempFile("two.js");
      observedFiles.setObserved(one, true);
      observedFiles.setObserved(two, true);

      await openList();

      expect(modals.visibleLabels().sort()).toEqual([one, two].sort());
    });

    it("stops observing the focused file and stays open", async () => {
      const one = writeTempFile("one.js");
      const two = writeTempFile("two.js");
      observedFiles.setObserved(one, true);
      observedFiles.setObserved(two, true);

      await openList();
      modals.activeSession().focusItem(one);
      modals.dispatch("modals:unobserve-file");
      await modals.settle();

      expect(observedFiles.isObserved(one)).toBe(false);
      expect(atom.modals.isOpen()).toBe(true);
      expect(modals.visibleLabels()).toEqual([two]);
    });

    it("closes once the last observed file is gone", async () => {
      observedFiles.setObserved(writeTempFile("only.js"), true);

      await openList();
      modals.dispatch("modals:unobserve-file");
      await modals.settle();

      expect(observedFiles.getObservedCount()).toBe(0);
      expect(atom.modals.isOpen()).toBe(false);
    });

    it("opens the confirmed file", async () => {
      const one = writeTempFile("one.js");
      observedFiles.setObserved(one, true);

      await openList();
      await modals.confirmItem((item) => item.filePath === one);

      // The confirm handler opens without awaiting, as the select-list version
      // did, so wait for the editor rather than the modal.
      const opened = await pollUntil(() => {
        const editor = atom.workspace.getActiveTextEditor();
        return editor && path.basename(editor.getPath() || "") === "one.js";
      });
      expect(opened).toBe(true);
      expect(atom.modals.isOpen()).toBe(false);
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
