const INPUT_LIMIT = 8 * 1024 * 1024;
const OUTPUT_LIMIT = 16 * 1024 * 1024;
const WIRE_LIMIT = 112 * 1024 * 1024;

function budgetError(subject) {
  const error = new RangeError(`${subject} exceeds Prettier's parser or IPC budget.`);
  error.code = "ERR_PRETTIER_BUDGET";
  return error;
}

function checkText(text, limit = INPUT_LIMIT) {
  if (typeof text !== "string") throw new TypeError("Prettier requires string text.");
  if (text.length > limit) throw budgetError("Text");
  return text;
}

// JSON IPC can escape one UTF-16 unit into six characters. Check the complete
// structure before Node allocates that wire string on either side of the pipe.
function checkMessage(message) {
  const ancestors = new Set();
  let units = 0,
    nodes = 0;
  function visit(value, depth) {
    if (++nodes > 100000 || depth > 64) throw budgetError("Message structure");
    if (typeof value === "string") units += 2 + value.length * 6;
    else if (value === null || value === undefined || typeof value === "boolean") units += 5;
    else if (typeof value === "number") units += 32;
    else if (typeof value === "object") {
      if (Array.isArray(value) && value.length > 100000) throw budgetError("Array length");
      if (ancestors.has(value)) throw new TypeError("Prettier IPC cannot contain cycles.");
      if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        throw new TypeError("Prettier IPC requires plain JSON values.");
      if (Object.hasOwn(value, "toJSON"))
        throw new TypeError("Prettier IPC cannot execute toJSON.");
      ancestors.add(value);
      units += 2 + (Array.isArray(value) ? value.length * 5 : 0);
      if (units > WIRE_LIMIT) throw budgetError("Message");
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!Object.hasOwn(descriptor, "value"))
          throw new TypeError("Prettier IPC cannot execute getters.");
        units += 4 + key.length * 6;
        visit(descriptor.value, depth + 1);
      }
      ancestors.delete(value);
    } else throw new TypeError("Prettier IPC requires JSON values.");
    if (units > WIRE_LIMIT) throw budgetError("Message");
  }
  visit(message, 0);
  return message;
}

function checkRequest(method, args) {
  if (["format", "formatWithCursor", "check"].includes(method)) checkText(args[0]);
}

function checkResult(method, result) {
  if (method === "format") checkText(result, OUTPUT_LIMIT);
  if (method === "formatWithCursor") checkText(result?.formatted, OUTPUT_LIMIT);
}

module.exports = {
  INPUT_LIMIT,
  OUTPUT_LIMIT,
  budgetError,
  checkText,
  checkMessage,
  checkRequest,
  checkResult,
};
