const { disposeTooltip, setTooltip } = require("./tooltip");
const getFormatOnSaveStatus = require("./save-status");
const { addCompositeTooltip } = require("./app-interface");

const updateStatusTile = (disposable, element) => {
  disposeTooltip();

  const formatStatus = getFormatOnSaveStatus();

  if (formatStatus === "enabled") {
    element.classList.add("text-success");
  } else {
    element.classList.remove("text-success");
  }

  element.dataset.prettierFormatOnSave = formatStatus;

  const newTooltip = addCompositeTooltip(element, [
    { title: `Format on Save: ${formatStatus}` },
    {
      title: "Toggle format on save",
      keyBindingExtra: "LMB",
      keyBindingCommand: "prettier:toggle",
    },
    {
      title: "Toggle observation for current file",
      keyBindingExtra: "Alt+LMB",
      keyBindingCommand: "prettier:toggle-observed",
    },
  ]);

  setTooltip(newTooltip);
  disposable.add(newTooltip);

  return newTooltip;
};

module.exports = updateStatusTile;
