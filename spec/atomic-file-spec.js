const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

describe("Prettier atomic project writes", () => {
  let directory, file, snapshot, writeFormattedFile;
  const original = "const  żółć='😀';\r\n";
  beforeEach(() => {
    jasmine.useRealClock();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "prettier-atomic-"));
    file = path.join(directory, "source.js");
    fs.writeFileSync(file, original);
    snapshot = require("../lib/bounded-file").readBoundedFile(file, 1024);
    ({ writeFormattedFile } = require("../lib/atomic-file"));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("keeps the original file after a partial temporary write fails", async () => {
    const write = fs.writeFileSync;
    spyOn(fs, "writeFileSync").and.callFake((target, ...args) => {
      if (typeof target === "number") {
        write(target, "partial");
        throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      }
      return write(target, ...args);
    });
    await expectAsync(writeFormattedFile(file, "formatted", snapshot)).toBeRejectedWithError(
      "disk full",
    );
    expect(fs.readFileSync(file, "utf8")).toBe(original);
    expect(fs.readdirSync(directory)).toEqual(["source.js"]);
  });

  it("keeps the original file after atomic replacement fails", async () => {
    spyOn(fs, "renameSync").and.throwError("replacement failed");
    await expectAsync(writeFormattedFile(file, "formatted", snapshot)).toBeRejectedWithError(
      "replacement failed",
    );
    expect(fs.readFileSync(file, "utf8")).toBe(original);
    expect(fs.readdirSync(directory)).toEqual(["source.js"]);
  });

  it("rechecks source content and identity after staging before publishing", async () => {
    const sync = fs.fsyncSync;
    spyOn(fs, "fsyncSync").and.callFake((fd) => {
      sync(fd);
      fs.writeFileSync(file, "external change");
    });
    const rename = spyOn(fs, "renameSync").and.callThrough();
    await expectAsync(writeFormattedFile(file, "formatted", snapshot)).toBeRejectedWithError(
      /Source changed/,
    );
    expect(rename).not.toHaveBeenCalled();
    expect(fs.readFileSync(file, "utf8")).toBe("external change");
    expect(fs.readdirSync(directory)).toEqual(["source.js"]);
  });

  it("preserves a symlinked directory and target permissions", async () => {
    const real = path.join(directory, "real"),
      link = path.join(directory, "link");
    fs.mkdirSync(real);
    const target = path.join(real, "source.js");
    fs.writeFileSync(target, original);
    if (process.platform !== "win32") fs.chmodSync(target, 0o640);
    fs.symlinkSync(real, link, "junction");
    const linkedFile = path.join(link, "source.js");
    const read = require("../lib/bounded-file").readBoundedFile(linkedFile, 1024);
    await writeFormattedFile(linkedFile, "formatted\r\n😀", read);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("formatted\r\n😀");
    expect(fs.statSync(target).mode & 0o777).toBe(read.stat.mode & 0o777);
    expect(fs.readdirSync(real)).toEqual(["source.js"]);
  });

  it("updates the file symlink target and refuses a retargeted link", async () => {
    const link = path.join(directory, "source-link.js");
    try {
      fs.symlinkSync(file, link, "file");
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
        pending("This Windows host does not permit file symlinks.");
        return;
      }
      throw error;
    }
    const read = require("../lib/bounded-file").readBoundedFile;
    await writeFormattedFile(link, "formatted", read(link, 1024));
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("formatted");
    const previous = read(link, 1024),
      other = path.join(directory, "other.js");
    fs.writeFileSync(other, "keep other");
    const sync = fs.fsyncSync;
    spyOn(fs, "fsyncSync").and.callFake((fd) => {
      sync(fd);
      fs.unlinkSync(link);
      fs.symlinkSync(other, link, "file");
    });
    await expectAsync(writeFormattedFile(link, "must not publish", previous)).toBeRejectedWithError(
      /Source changed/,
    );
    expect(fs.readFileSync(file, "utf8")).toBe("formatted");
    expect(fs.readFileSync(other, "utf8")).toBe("keep other");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readdirSync(directory).filter((name) => name.endsWith("prettier-tmp"))).toEqual([]);
  });
});
