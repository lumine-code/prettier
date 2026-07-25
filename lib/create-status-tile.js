const getFormatOnSaveStatus = require("./save-status");
const { toggleFormatOnSave } = require("./atom-interface");

const createStatusTile = (callbacks = {}) => {
  const element = document.createElement("div");
  const prettierTextNode = document.createTextNode("Prettier");

  element.appendChild(prettierTextNode);
  element.classList.add("prettier-status-tile");
  element.classList.add("inline-block");
  element.dataset.prettierFormatOnSave = getFormatOnSaveStatus();
  element.addEventListener("click", (event) => {
    if (event.altKey && callbacks.onToggleObserved) {
      event.preventDefault();
      callbacks.onToggleObserved();
      return;
    }
    toggleFormatOnSave();
  });

  return element;
};

module.exports = createStatusTile;
