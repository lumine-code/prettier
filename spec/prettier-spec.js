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
        // Retries because Windows keeps a directory non-empty until the last handle on a
        // child closes, and `force` swallows only ENOENT.
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Windows can refuse to delete a directory whose files were just saved.
      }
    });

    it("toggles the active file on and off", async () => {
      const filePath = writeTempFile("toggle.js", "const a = 1;\n");
      await lumine.workspace.open(filePath);

      lumine.commands.dispatch(workspaceElement, "prettier:toggle-observed");
      expect(observedFiles.isObserved(filePath)).toBe(true);

      lumine.commands.dispatch(workspaceElement, "prettier:toggle-observed");
      expect(observedFiles.isObserved(filePath)).toBe(false);
    });

    it("keeps the opt-in after the file's editor is destroyed", async () => {
      const filePath = writeTempFile("closed.js", "const a = 1;\n");
      const editor = await lumine.workspace.open(filePath);
      observedFiles.setObserved(filePath, true);

      editor.destroy();

      expect(observedFiles.isObserved(filePath)).toBe(true);
    });

    it("clears every observed file at once", () => {
      observedFiles.setObserved(writeTempFile("one.js", ""), true);
      observedFiles.setObserved(writeTempFile("two.js", ""), true);
      expect(observedFiles.getObservedCount()).toBe(2);

      lumine.commands.dispatch(workspaceElement, "prettier:clear-all-observed-files");

      expect(observedFiles.getObservedCount()).toBe(0);
    });

    it("formats an observed file on save while format-on-save is disabled", async () => {
      lumine.config.set("prettier.formatOnSaveOptions.enabled", false);
      const filePath = writeTempFile("observed.js", "const  foo   = {a:1}\n");
      const editor = await lumine.workspace.open(filePath);
      observedFiles.setObserved(filePath, true);

      await editor.save();

      expect(editor.getText()).toBe("const foo = { a: 1 };\n");
    }, 60000);

    it("leaves an unobserved file untouched on save", async () => {
      lumine.config.set("prettier.formatOnSaveOptions.enabled", false);
      const filePath = writeTempFile("plain.js", "const  bar   = {a:1}\n");
      const editor = await lumine.workspace.open(filePath);

      await editor.save();

      expect(editor.getText()).toBe("const  bar   = {a:1}\n");
    }, 60000);

    it("still skips a file Prettier has no parser for", async () => {
      lumine.config.set("prettier.formatOnSaveOptions.enabled", false);
      const filePath = writeTempFile("observed.xyz", "const  baz   = {a:1}\n");
      const editor = await lumine.workspace.open(filePath);
      observedFiles.setObserved(filePath, true);

      await editor.save();

      expect(editor.getText()).toBe("const  baz   = {a:1}\n");
    }, 60000);
  });

  describe("prettier:toggle", () => {
    it("flips the format-on-save setting", () => {
      expect(lumine.config.get("prettier.formatOnSaveOptions.enabled")).toBe(false);
      lumine.commands.dispatch(workspaceElement, "prettier:toggle");
      expect(lumine.config.get("prettier.formatOnSaveOptions.enabled")).toBe(true);
      lumine.commands.dispatch(workspaceElement, "prettier:toggle");
      expect(lumine.config.get("prettier.formatOnSaveOptions.enabled")).toBe(false);
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
          .some((notification) => notification.getMessage().includes("No parser found")),
      );
      expect(warned).toBe(true);
    }, 60000);
  });

  describe("prettier:show-diagnostics", () => {
    it("shows a diagnostics notification", async () => {
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
      lumine.config.set("prettier.formatOnSaveOptions.enabled", false);
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

      lumine.config.set("prettier.formatOnSaveOptions.enabled", true);
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
      lumine.config.set("prettier.formatOnSaveOptions.enabled", true);
      const editor = await lumine.workspace.open(filePath);

      await editor.save();

      await waitForFrames();
      expect(editor.getText()).toBe("const loose = { answer: 1 };\n");
      expect(git(tempDir, "status", "--short", "--", fileName)).toBe(`?? ${fileName}`);
    }, 60000);
  });
});
