const getFormatOnSaveStatus = require("./save-status");
const { addCompositeTooltip, toggleFormatOnSave } = require("./app-interface");

const createStatusTile = (callbacks = {}) => {
  const element = document.createElement("status-bar-tile");
  const prettierTextNode = document.createTextNode("Prettier");

  element.appendChild(prettierTextNode);
  element.classList.add("prettier-status-tile");
  element.dataset.prettierFormatOnSave = getFormatOnSaveStatus();
  addCompositeTooltip(element, [
    { title: "Toggle format on save", keyBindingExtra: "LMB" },
    { title: "Toggle whether this file is observed", keyBindingExtra: "alt+LMB" },
  ]);
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
