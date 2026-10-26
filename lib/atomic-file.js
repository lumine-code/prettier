const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { readBoundedFile, sameFile } = require("./bounded-file");
const { INPUT_LIMIT, OUTPUT_LIMIT, checkText } = require("./message-budget");

async function writeFormattedFile(filePath, text, snapshot) {
  checkText(text, OUTPUT_LIMIT);
  const target = snapshot.realPath;
  if (!target || fs.realpathSync(filePath) !== target)
    throw new Error("Source target changed during formatting; no changes were written.");
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomBytes(8).toString("hex")}.prettier-tmp`,
  );
  let descriptor,
    committed = false;
  try {
    descriptor = fs.openSync(temporary, "wx", snapshot.stat.mode);
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.chmodSync(temporary, snapshot.stat.mode);
    for (let attempt = 0; ; attempt++) {
      const current = readBoundedFile(filePath, INPUT_LIMIT);
      if (
        current.realPath !== target ||
        !sameFile(current.stat, snapshot.stat) ||
        current.text !== snapshot.text
      )
        throw new Error("Source changed during formatting; no changes were written.");
      try {
        fs.renameSync(temporary, target);
        committed = true;
        break;
      } catch (error) {
        if (
          process.platform !== "win32" ||
          !["EPERM", "EACCES", "EBUSY"].includes(error.code) ||
          attempt === 4
        )
          throw error;
        await delay(50);
      }
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (!committed) fs.rmSync(temporary, { force: true });
  }
}

module.exports = { writeFormattedFile };
