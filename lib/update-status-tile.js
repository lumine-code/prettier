const { disposeTooltip, setTooltip } = require("./tooltip");
const getFormatOnSaveStatus = require("./save-status");
const { addTooltip } = require("./atom-interface");

const updateStatusTile = (disposable, element) => {
  disposeTooltip();

  const formatStatus = getFormatOnSaveStatus();

  if (formatStatus === "enabled") {
    element.classList.add("text-success");
  } else {
    element.classList.remove("text-success");
  }

  element.dataset.prettierFormatOnSave = formatStatus;

  const newTooltip = addTooltip(element, {
    title:
      `Format on Save: ${getFormatOnSaveStatus()}<br>Click to toggle` +
      `<br>Alt+click to observe the current file`,
  });

  setTooltip(newTooltip);
  disposable.add(newTooltip);

  return newTooltip;
};

module.exports = updateStatusTile;
