const getPrettierInstance = require("./get-prettier-instance");
const general = require("./general");
const ranges = require("./ranges");
const isFileFormattable = require("./is-file-formattable");
const isPrettierProperVersion = require("./prettier-version");

module.exports = {
  ...general,
  ...ranges,
  getPrettierInstance,
  isPrettierProperVersion,
  isFileFormattable,
};
