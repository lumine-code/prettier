const fs = require("fs");
const os = require("os");
const path = require("path");
const { Disposable, Task } = require("lumine");

describe("Prettier selected project containment", () => {
  let tree, directory, projectPath, filePath, providers, calls, log;

  async function dispatchSelected() {
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "prettier:format-selected");
    await conditionPromise(
      () =>
        calls.length > 0 ||
        lumine.notifications
          .getNotifications()
          .some((notification) =>
            /Format selected skipped|Formatting failed/.test(notification.getMessage()),
          ),
    );
  }

  function selection(target) {
    providers.push(
      lumine.packages.serviceHub.provide("tree-view.selection", "1.0.0", {
        selectedPaths: () => [target],
      }),
    );
  }

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    directory = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "prettier-containment-")),
    );
    projectPath = path.join(directory, "project");
    fs.mkdirSync(path.join(projectPath, "..config"), { recursive: true });
    filePath = path.join(projectPath, "..config", "source.js");
    fs.writeFileSync(filePath, "const  value={answer:1}\n");
    lumine.project.setPaths([projectPath]);
    lumine.config.set("core.ignoredNames", []);
    lumine.config.set("tree-view.hideIgnoredNames", false);
    const treePackage = await lumine.packages.activatePackage("tree-view");
    tree = treePackage.mainModule.getTreeViewInstance();
    const pack = await lumine.packages.activatePackage("prettier");
    log = require(path.join(pack.path, "lib/log"));
    spyOn(log, "log").and.callThrough();
    providers = [];
    calls = [];
    spyOn(Task, "once").and.callFake((_worker, projects) => {
      calls.push(projects);
      return {
        terminate() {},
        on() {
          return new Disposable();
        },
      };
    });
  });

  afterEach(async () => {
    for (const provider of providers) provider.dispose();
    if (lumine.packages.isPackageActive("prettier"))
      await lumine.packages.deactivatePackage("prettier");
    if (lumine.packages.isPackageActive("tree-view"))
      await lumine.packages.deactivatePackage("tree-view");
    lumine.project.setPaths([]);
    const relative = path.relative(fs.realpathSync.native(os.tmpdir()), directory);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
      throw new Error("Fixture escaped its temporary root");
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("accepts a real tree-view selection beneath a legitimate two-dot child", async () => {
    await tree.revealPath(filePath, { show: true });
    expect(tree.selectedPaths()).toEqual([filePath]);
    const original = fs.readFileSync(filePath, "utf8");
    await dispatchSelected();
    expect(calls.length).toBe(1);
    expect(calls[0]?.[0].projectPath).toBe(projectPath);
    expect(calls[0]?.[0].files).toEqual([filePath]);
    expect(fs.readFileSync(filePath, "utf8")).toBe(original);
  });

  it("accepts the real selected project root itself", async () => {
    await tree.revealPath(projectPath, { show: true });
    expect(tree.selectedPaths()).toEqual([projectPath]);
    await dispatchSelected();
    expect(calls.length).toBe(1);
    expect(calls[0]?.[0].projectPath).toBe(projectPath);
    expect(calls[0]?.[0].files).toEqual([filePath]);
  });

  for (const name of ["parent", "parent-file", "sibling"]) {
    it(`rejects an existing ${name} selection before starting a formatting task`, async () => {
      let target = directory;
      if (name === "parent-file") {
        target = path.join(directory, "outside.js");
        fs.writeFileSync(target, "const  outside=1\n");
      } else if (name === "sibling") {
        target = path.join(directory, "project-other");
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, "outside.js"), "const  outside=1\n");
      }
      selection(target);
      await dispatchSelected();
      expect(log.log).toHaveBeenCalledWith("Format selected skipped outside project:", target);
      expect(calls).toEqual([]);
    });
  }

  if (process.platform === "win32") {
    it("rejects an absolute native relative path to another drive", async () => {
      const currentDrive = path.parse(projectPath).root.charAt(0).toUpperCase();
      const otherDrive = currentDrive === "D" ? "C" : "D";
      const target = `${otherDrive}:\\__lumine_parent_guard_probe__\\outside.js`;
      const exists = fs.existsSync.bind(fs);
      spyOn(fs, "existsSync").and.callFake(
        (candidate) => candidate === target || exists(candidate),
      );
      selection(target);
      await dispatchSelected();
      expect(log.log).toHaveBeenCalledWith("Format selected skipped outside project:", target);
      expect(calls).toEqual([]);
    });
  }
});
