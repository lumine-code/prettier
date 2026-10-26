describe("Prettier project payload budgets", () => {
  it("counts native array indices including hidden data while ignoring named properties", () => {
    const { checkMessage } = require("../lib/message-budget");
    const array = [undefined, null, "😀"];
    Object.defineProperty(array, "1", { value: "hidden", enumerable: false });
    Object.defineProperty(array, "unused", {
      get() {
        throw Error("Named property executed");
      },
      enumerable: true,
    });
    expect(checkMessage(array) === array).toBe(true);
    expect(JSON.stringify(array)).toBe('[null,"hidden","😀"]');
  });

  it("cancels streaming collection before returning a partial oversized plan", async () => {
    const { createCollectionBudget } = require("../lib/project-budget");
    const collector = require("../lib/collect-project-files");
    const fs = require("node:fs");
    spyOn(fs, "statSync").and.returnValue({ isDirectory: () => true });
    const cancel = jasmine.createSpy("cancel crawl");
    spyOn(lumine.project, "crawl").and.callFake((options) => {
      options.didFindPaths(["one.js", "two.js", "three.js"]);
      return Object.assign(Promise.resolve(), { cancel });
    });
    await expectAsync(
      collector(["root"], false, { budget: createCollectionBudget({ maxFiles: 2 }) }),
    ).toBeRejectedWithError(/budget/);
    expect(cancel).toHaveBeenCalled();
  });

  it("shares the total path budget and bounds complete diagnostic packets", () => {
    const { createCollectionBudget, createErrorReport } = require("../lib/project-budget");
    const budget = createCollectionBudget({ maxUnits: 10 });
    budget.add("root", false);
    budget.add("a.js");
    expect(() => budget.add("b.js")).toThrowError(/budget/);
    const report = createErrorReport({ maxUnits: 20 });
    report.add("file", new Error("first"));
    report.add("file", new Error("second"));
    report.add("file", new Error("too much"));
    expect(report.result(2)).toEqual({
      totalFormatted: 2,
      totalErrored: 3,
      errors: [
        { filePath: "file", message: "first" },
        { filePath: "file", message: "second" },
      ],
      omittedErrors: 1,
    });
    const long = createErrorReport();
    long.add("file", new Error("x".repeat(10000)));
    expect(long.result().errors[0].message.length).toBe(4096);
    expect(long.result().errors[0].truncated).toBe(true);
  });

  it("checks formatted result descriptors without executing a plugin accessor", () => {
    const { checkResult } = require("../lib/message-budget");
    const getter = jasmine.createSpy("formatted getter").and.throwError("Unexpected allocation");
    expect(() =>
      checkResult(
        "formatWithCursor",
        Object.defineProperty({}, "formatted", { get: getter, enumerable: true }),
      ),
    ).toThrowError(/without getters/);
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      checkResult("formatWithCursor", { formatted: "😀\r\n", cursorOffset: 2 }),
    ).not.toThrow();
  });
});
