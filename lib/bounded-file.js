const fs = require("node:fs");
const { StringDecoder } = require("node:string_decoder");
const { budgetError } = require("./message-budget");

const sameFile = (left, right) =>
  ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every((key) => left[key] === right[key]);

function readBoundedFile(filePath, limit) {
  const fd = fs.openSync(filePath, "r");
  try {
    const before = fs.fstatSync(fd);
    if (before.size > limit * 3) throw budgetError(filePath);
    const decoder = new StringDecoder("utf8");
    const buffer = Buffer.allocUnsafe(65536);
    const parts = [];
    let units = 0,
      bytes = 0;
    const accept = (text) => {
      units += text.length;
      if (units > limit) throw budgetError(filePath);
      parts.push(text);
    };
    for (let count; (count = fs.readSync(fd, buffer, 0, buffer.length, null));) {
      bytes += count;
      if (bytes > before.size) throw new Error(`Source changed while reading ${filePath}.`);
      accept(decoder.write(buffer.subarray(0, count)));
    }
    accept(decoder.end());
    if (!sameFile(before, fs.fstatSync(fd)) || !sameFile(before, fs.statSync(filePath)))
      throw new Error(`Source changed while reading ${filePath}.`);
    return { text: parts.join(""), stat: before };
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { readBoundedFile, sameFile };
