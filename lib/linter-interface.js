const { getCurrentFilePath } = require("./editor-interface");

// Holds a reference to an IndieDelegate from the linter package. Used for displaying syntax errors
// See: http://steelbrain.me/linter/types/indie-linter-v2.html
let indieDelegate = null;

const set = (newIndieDelegate) => {
  indieDelegate = newIndieDelegate;
};

const get = () => indieDelegate;

const setMessages = (editor, messages) => {
  const filePath = getCurrentFilePath(editor);

  if (!indieDelegate || !filePath) {
    console.error(
      `prettier attempted to set messages with linter package, but was unable. Messages: ${JSON.stringify(
        messages,
      )}`,
    );
    return;
  }

  indieDelegate.setMessages(filePath, messages);
};

const clearLinterErrors = (editor) => setMessages(editor, []);

module.exports = {
  set,
  get,
  clearLinterErrors,
  setMessages,
};
