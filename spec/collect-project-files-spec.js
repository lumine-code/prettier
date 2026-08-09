const fs = require("fs");
const path = require("path");
const os = require("os");

const collectProjectFiles = require("../lib/collect-project-files");

function buildFixture() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "prettier-collect-")));
  fs.writeFileSync(path.join(dir, "index.js"), "const a = 1\n");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "app.js"), "const b = 2\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), "build/\n");
  fs.mkdirSync(path.join(dir, "build"));
  fs.writeFileSync(path.join(dir, "build", "bundle.js"), "const c = 3\n");
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.writeFileSync(path.join(dir, "node_modules", "dep.js"), "const d = 4\n");
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(path.join(dir, ".git", "config"), "[core]\n");
  return dir;
}

function relativize(dir, paths) {
  return new Set(paths.map((p) => path.relative(dir, p).split(path.sep).join("/")));
}

describe("prettier project file collection", () => {
  let dir;

  beforeEach(() => {
    dir = buildFixture();
    lumine.config.set("prettier.excludeVcsIgnoredPaths", true);
  });

  it("collects the files under a directory", async () => {
    const files = relativize(dir, await collectProjectFiles([dir], true));

    expect(files.has("index.js")).toBe(true);
    expect(files.has("src/app.js")).toBe(true);
  });

  it("skips VCS-ignored files by default", async () => {
    const files = relativize(dir, await collectProjectFiles([dir], true));

    expect(files.has("build/bundle.js")).toBe(false);
  });

  it("includes VCS-ignored files when the setting is off", async () => {
    lumine.config.set("prettier.excludeVcsIgnoredPaths", false);
    const files = relativize(dir, await collectProjectFiles([dir], true));

    expect(files.has("build/bundle.js")).toBe(true);
  });

  it("never descends into .git", async () => {
    lumine.config.set("prettier.excludeVcsIgnoredPaths", false);
    const files = relativize(dir, await collectProjectFiles([dir], true));

    expect([...files].some((file) => file.startsWith(".git/"))).toBe(false);
  });

  it("skips node_modules when asked to", async () => {
    const files = relativize(dir, await collectProjectFiles([dir], true));

    expect([...files].some((file) => file.startsWith("node_modules/"))).toBe(false);
  });

  it("keeps node_modules when not asked to skip it", async () => {
    const files = relativize(dir, await collectProjectFiles([dir], false));

    expect(files.has("node_modules/dep.js")).toBe(true);
  });

  it("takes an explicit file target as given", async () => {
    const target = path.join(dir, "build", "bundle.js");

    expect(await collectProjectFiles([target], true)).toEqual([target]);
  });

  it("ignores a target that cannot be read", async () => {
    expect(await collectProjectFiles([path.join(dir, "nope")], true)).toEqual([]);
  });

  it("reports a file reachable through two targets once", async () => {
    const files = await collectProjectFiles([dir, path.join(dir, "src")], true);
    const app = files.filter((file) => path.basename(file) === "app.js");

    expect(app.length).toBe(1);
  });
});
