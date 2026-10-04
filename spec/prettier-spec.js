const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

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

  async function waitForFrames(frames = 30) {
    for (let i = 0; i < frames; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  function git(cwd, ...args) {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trimEnd();
  }

  function initializeRepository(directory, files) {
    git(directory, "init", "-q");
    git(directory, "config", "user.name", "Prettier Spec");
    git(directory, "config", "user.email", "prettier-spec@invalid.example");
    git(directory, "config", "core.autocrlf", "false");
    git(directory, "config", "commit.gpgsign", "false");
    for (const [name, contents] of Object.entries(files)) {
      fs.writeFileSync(path.join(directory, name), contents);
    }
    git(directory, "add", "--", ...Object.keys(files));
    git(directory, "commit", "-qm", "Initial fixture");
  }

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);

    lumine.project.setPaths([PROJECT_DIR]);
    await lumine.packages.activatePackage("code-format");
    await lumine.packages.activatePackage("prettier");
  });

  afterEach(() => {
    // Shut down the shared prettier worker process between specs.
    require("../lib/prettier-service").terminate();
  });

  describe("activation", () => {
    it("registers the workspace commands", () => {
      const commands = lumine.commands
        .findCommands({ target: workspaceElement })
        .map((command) => command.name);

      expect(commands).toContain("prettier:format");
      expect(commands).toContain("prettier:format-projects");
      expect(commands).toContain("prettier:show-diagnostics");
    });
  });

  describe("prettier:format", () => {
    it("formats the active editor with the bundled Prettier", async () => {
      const editor = await lumine.workspace.open(path.join(PROJECT_DIR, "messy.js"));
      const original = editor.getText();

      lumine.commands.dispatch(workspaceElement, "prettier:format");

      const changed = await pollUntil(() => editor.getText() !== original);
      expect(changed).toBe(true);
      expect(editor.getText()).toBe("const foo = { a: 1 };\nmodule.exports = foo;\n");
    }, 60000);

    it("warns when no parser exists for the file type", async () => {
      await lumine.workspace.open(path.join(PROJECT_DIR, "unknown.xyz"));
      lumine.commands.dispatch(workspaceElement, "prettier:format");

      const warned = await pollUntil(() =>
        lumine.notifications
          .getNotifications()
          .some((notification) => notification.getMessage().includes("No formatter available")),
      );
      expect(warned).toBe(true);
    }, 60000);
  });

  describe("shared hub integration", () => {
    it("formats an observed file on save even when the hub's switch is off", async () => {
      const editor = await lumine.workspace.open(path.join(PROJECT_DIR, "messy.js"));
      const source = "const  observed={answer:1}\n";
      editor.setText(source);
      lumine.config.set("code-format.formatOnSave", false);
      // Warm the lazy engine without changing or saving the fixture on disk.
      const main = lumine.packages.getActivePackage("prettier").mainModule;
      const request = {
        text: source,
        path: editor.getPath(),
        reason: "manual",
        signal: new AbortController().signal,
        isCurrent: () => editor.getText() === source,
      };
      await main.provideCodeFormatFile().canFormat(editor, request);
      lumine.commands.dispatch(workspaceElement, "code-format:toggle-observed");
      const manager = lumine.packages.getActivePackage("code-format").mainModule.manager;
      await manager.formatOnSave(editor);
      expect(editor.getText()).toBe("const observed = { answer: 1 };\n");
      lumine.commands.dispatch(workspaceElement, "code-format:clear-all-observed-files");
    }, 60000);

    it("applies the Prettier provider through the generic command in one undo", async () => {
      const editor = await lumine.workspace.open(path.join(PROJECT_DIR, "messy.js"));
      const source = "const  shared={answer:2}\n";
      editor.setText(source);
      editor.getBuffer().clearUndoStack();
      lumine.config.set("code-format.defaultProvider", "prettier");
      const manager = lumine.packages.getActivePackage("code-format").mainModule.manager;
      expect(await manager.formatCommand({ target: lumine.views.getView(editor) })).toBe(true);
      expect(editor.getText()).toBe("const shared = { answer: 2 };\n");
      editor.undo();
      expect(editor.getText()).toBe(source);
    }, 60000);
  });

  describe("prettier:show-diagnostics", () => {
    it("shows a diagnostics notification", async () => {
      await lumine.workspace.open(path.join(PROJECT_DIR, "messy.js"));
      lumine.commands.dispatch(workspaceElement, "prettier:show-diagnostics");

      const notified = await pollUntil(() =>
        lumine.notifications
          .getNotifications()
          .some((notification) => notification.getMessage().includes("diagnostics")),
      );
      expect(notified).toBe(true);
    }, 60000);
  });

  describe("Git index safety", () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "prettier-git-")));
    });

    afterEach(() => {
      lumine.config.set("code-format.formatOnSave", false);
      lumine.project.setPaths([PROJECT_DIR]);
      for (const editor of lumine.workspace.getTextEditors()) {
        if (editor.getPath()?.startsWith(tempDir)) editor.destroy();
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Windows can keep short-lived Git or file-watcher handles open after a spec.
      }
    });

    it("preserves partially staged content when formatting on save", async () => {
      const fileName = "partial.js";
      const filePath = path.join(tempDir, fileName);
      initializeRepository(tempDir, { [fileName]: "const value = 1;\n" });
      fs.writeFileSync(filePath, "const value = 2;\n");
      git(tempDir, "add", "--", fileName);
      const stagedHash = git(tempDir, "rev-parse", `:${fileName}`);

      lumine.config.set("code-format.formatOnSave", true);
      const editor = await lumine.workspace.open(filePath);
      editor.setText("const  value={answer:3}\n");
      await editor.save();

      await waitForFrames();
      expect(editor.getText()).toBe("const value = { answer: 3 };\n");
      expect(git(tempDir, "rev-parse", `:${fileName}`)).toBe(stagedHash);
      expect(git(tempDir, "status", "--short", "--", fileName)).toBe(`MM ${fileName}`);
    }, 60000);

    it("leaves project formatting unstaged", async () => {
      const fileName = "project.js";
      const filePath = path.join(tempDir, fileName);
      initializeRepository(tempDir, { [fileName]: "const  project={answer:1}\n" });
      const indexHash = git(tempDir, "rev-parse", `:${fileName}`);
      lumine.project.setPaths([tempDir]);

      lumine.commands.dispatch(workspaceElement, "prettier:format-projects");

      const finished = await pollUntil(() =>
        lumine.notifications
          .getNotifications()
          .some((notification) => notification.getMessage().includes("Formatted 1 file(s)")),
      );
      expect(finished).toBe(true);
      expect(fs.readFileSync(filePath, "utf8")).toBe("const project = { answer: 1 };\n");
      expect(git(tempDir, "rev-parse", `:${fileName}`)).toBe(indexHash);
      expect(git(tempDir, "status", "--short", "--", fileName)).toBe(` M ${fileName}`);
      expect(git(tempDir, "diff", "--cached", "--name-only", "--", fileName)).toBe("");
    }, 60000);

    it("keeps an untracked file untracked after formatting on save", async () => {
      initializeRepository(tempDir, { "tracked.txt": "fixture\n" });
      const fileName = "untracked.js";
      const filePath = path.join(tempDir, fileName);
      fs.writeFileSync(filePath, "const  loose={answer:1}\n");
      lumine.config.set("code-format.formatOnSave", true);
      const editor = await lumine.workspace.open(filePath);

      await editor.save();

      await waitForFrames();
      expect(editor.getText()).toBe("const loose = { answer: 1 };\n");
      expect(git(tempDir, "status", "--short", "--", fileName)).toBe(`?? ${fileName}`);
    }, 60000);
  });
});
