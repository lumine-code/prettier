const path = require("path");

const { someGlobsMatchFilePath, isPresent, getDirFromFilePath } = require("../lib/general");

describe("prettier glob matching", () => {
  it("matches a glob against a path built with the platform separator", () => {
    const filePath = ["", "proj", "dist", "bundle.js"].join(path.sep);

    expect(someGlobsMatchFilePath(["**/dist/**"], filePath)).toBe(true);
  });

  it("matches a glob against a forward-slash path on any platform", () => {
    expect(someGlobsMatchFilePath(["**/dist/**"], "/proj/dist/bundle.js")).toBe(true);
  });

  // The regression that made this spec worth writing: `picomatch.isMatch` is the
  // raw matcher and does not normalize separators, so a Windows path silently
  // stopped matching when minimatch was replaced.
  it("matches a glob against a backslash path", () => {
    expect(someGlobsMatchFilePath(["**/dist/**"], "C:\\proj\\dist\\bundle.js")).toBe(
      process.platform === "win32",
    );
  });

  it("matches on the basename alone", () => {
    const filePath = ["", "proj", "src", "index.js"].join(path.sep);

    expect(someGlobsMatchFilePath(["index.js"], filePath)).toBe(true);
  });

  it("does not match an unrelated glob", () => {
    expect(someGlobsMatchFilePath(["**/build/**"], "/proj/dist/bundle.js")).toBe(false);
  });

  it("reports no match for an absent path", () => {
    expect(someGlobsMatchFilePath(["**"], "")).toBe(false);
    expect(someGlobsMatchFilePath(["**"], undefined)).toBe(false);
  });

  it("reports presence of values and lengths", () => {
    expect(isPresent("a")).toBe(true);
    expect(isPresent("")).toBe(false);
    expect(isPresent(undefined)).toBe(false);
  });

  it("takes the directory of a file path", () => {
    const filePath = ["", "proj", "src", "index.js"].join(path.sep);

    expect(getDirFromFilePath(filePath)).toBe(["", "proj", "src"].join(path.sep));
    expect(getDirFromFilePath("")).toBe(undefined);
  });
});
