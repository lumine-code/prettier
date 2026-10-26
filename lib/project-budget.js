const { budgetError, checkMessage } = require("./message-budget");

const FILE_LIMIT = 50000;
const PATH_UNITS = 8 * 1024 * 1024;
const ERROR_UNITS = 1024 * 1024;

function createCollectionBudget({ maxFiles = FILE_LIMIT, maxUnits = PATH_UNITS } = {}) {
  let count = 0,
    units = 0,
    failure;
  return {
    add(value, file = true) {
      if (failure) throw failure;
      if (typeof value !== "string") throw new TypeError("Project paths must be strings.");
      units += value.length;
      if (file) count++;
      if (count > maxFiles || units > maxUnits) {
        failure = budgetError("Project file collection");
        throw failure;
      }
    },
  };
}

function createErrorReport({ maxUnits = ERROR_UNITS, maxCount = 1000 } = {}) {
  const errors = [];
  let units = 0,
    total = 0;
  return {
    add(filePath, error) {
      total++;
      const rawMessage = String(error?.message ?? error);
      const path = String(filePath);
      const entry = { filePath: path.slice(0, 4096), message: rawMessage.slice(0, 4096) };
      if (path.length > 4096 || rawMessage.length > 4096) entry.truncated = true;
      const length = entry.filePath.length + entry.message.length;
      if (errors.length >= maxCount || units + length > maxUnits) return;
      units += length;
      errors.push(entry);
    },
    result(totalFormatted = 0) {
      const result = {
        totalFormatted,
        totalErrored: total,
        errors,
        omittedErrors: total - errors.length,
      };
      checkMessage({ event: "prettier:format-done", args: [result] });
      return result;
    },
  };
}

module.exports = { FILE_LIMIT, createCollectionBudget, createErrorReport };
