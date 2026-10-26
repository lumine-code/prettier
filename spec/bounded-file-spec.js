const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

describe("Prettier bounded disk inputs", () => {
  let directory, readBoundedFile;
  beforeEach(() => {
    ({ readBoundedFile } = require("../lib/bounded-file"));
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "prettier-file-"));
  });
  afterEach(() => fs.rmSync(directory, { force: true, recursive: true }));

  it("rejects oversized stat metadata before allocating file contents", () => {
    const file = path.join(directory, "large.js");
    fs.writeFileSync(file, "");
    fs.truncateSync(file, 25 * 1024 * 1024);
    const read = spyOn(fs, "readSync").and.callThrough();
    expect(() => readBoundedFile(file, 8 * 1024 * 1024)).toThrowError(/budget/);
    expect(read).not.toHaveBeenCalled();
  });

  it("bounds decoded units and preserves multibyte characters crossing disk chunks", () => {
    const file = path.join(directory, "source.js");
    const text = "x".repeat(65535) + "😀é\r\n";
    fs.writeFileSync(file, text);
    expect(readBoundedFile(file, text.length).text).toBe(text);
    expect(() => readBoundedFile(file, text.length - 1)).toThrowError(/budget/);
  });
});
