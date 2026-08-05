const { getCurrentFilePath } = require("./editor-interface");
const linter = require("./linter-interface");
const { addErrorNotification } = require("./app-interface");
const { createPoint, createRange } = require("./helpers");

const errorLine = (error) => (error.loc.start ? error.loc.start.line : error.loc.line);

const errorColumn = (error) => (error.loc.start ? error.loc.start.column : error.loc.column);

// NOTE: Prettier error locations are not zero-based (i.e., they start at 1)
const buildPointArrayFromPrettierErrorAndRange = (error, bufferRange) =>
  createPoint(
    errorLine(error) + bufferRange.start.row - 1,
    errorLine(error) === 0
      ? errorColumn(error) + bufferRange.start.column - 1
      : errorColumn(error) - 1,
  );

const buildExcerpt = (error) => {
  const match = /(.*)\s\(\d+:\d+\).*/.exec(error.message);
  return match ? match[1] : undefined;
};

const setErrorMessageInLinter = ({ editor, bufferRange, error }) =>
  linter.setMessages(editor, [
    {
      location: {
        file: getCurrentFilePath(editor),
        position: createRange(
          buildPointArrayFromPrettierErrorAndRange(error, bufferRange),
          buildPointArrayFromPrettierErrorAndRange(error, bufferRange),
        ),
      },
      excerpt: buildExcerpt(error),
      severity: "error",
    },
  ]);

const isSyntaxError = ({ error }) => {
  const line = error.loc && (error.loc.start ? error.loc.start.line : error.loc.line);
  return Number.isInteger(line);
};

const isUndefinedError = ({ error }) => error.message === "undefined";

const isFilePathPresent = ({ editor }) => getCurrentFilePath(editor) != null;

const displayErrorInPopup = (args) => {
  console.error(args.error);
  addErrorNotification(`prettier failed: ${args.error.message}`, {
    stack: args.error.stack,
    dismissable: true,
  });
};

const handleError = (args) => {
  if (isSyntaxError(args) && isFilePathPresent(args)) {
    setErrorMessageInLinter(args);
  } else if (isUndefinedError(args)) {
    console.error("Prettier encountered an error:", args.error);
  } else {
    displayErrorInPopup(args);
  }
};

module.exports = handleError;
