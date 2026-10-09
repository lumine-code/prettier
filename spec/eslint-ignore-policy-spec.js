const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Prettier .eslintignore eligibility", () => {
  let directory, temporaryRoot, editor, originalPaths, createFormatProvider;

  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openPath", "openExternal", "openApplication", "showItemInFolder"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    temporaryRoot = fs.realpathSync.native(os.tmpdir());
    directory = fs.realpathSync.native(
      fs.mkdtempSync(path.join(temporaryRoot, "prettier-ignore-policy-")),
    );
    originalPaths = lumine.project.getPaths();
    lumine.project.setPaths([directory]);
    await lumine.packages.activatePackage("prettier");
    ({ createFormatProvider } = require("../lib/format-provider"));
    lumine.config.set("prettier.requireProjectDependency", false);
    lumine.config.set("prettier.requireConfig", false);
    lumine.config.set("prettier.useGlobalPrettier", false);
    lumine.config.set("prettier.respectEslintignore", true);
  });

  afterEach(() => {
    editor?.destroy();
    require("../lib/prettier-service").terminate();
    lumine.project.setPaths(originalPaths);
    const relative = path.relative(temporaryRoot, fs.realpathSync.native(directory));
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`)
    )
      throw new Error("Unsafe ignore fixture cleanup");
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function eligible(name, rules) {
    fs.writeFileSync(path.join(directory, ".eslintignore"), rules);
    const filePath = path.join(directory, name);
    fs.writeFileSync(filePath, "const value=1\n");
    editor = await lumine.workspace.open(filePath);
    const text = editor.getText();
    const request = {
      text,
      path: filePath,
      signal: new AbortController().signal,
      isCurrent: () =>
        !editor.isDestroyed() && editor.getText() === text && editor.getPath() === filePath,
    };
    return createFormatProvider().canFormat(editor, request);
  }

  it("allows a file re-included by a later negative rule", async () => {
    expect(await eligible("keep.js", "*.js\n!keep.js\n")).toBe(true);
  });

  it("keeps unrelated files eligible when an exception names a different file", async () => {
    expect(await eligible("ordinary.js", "generated.js\n!keep.js\n")).toBe(true);
  });

  it("still declines a file matched by the positive ignore rule", async () => {
    expect(await eligible("generated.js", "generated.js\n!keep.js\n")).toBe(false);
  });
});
