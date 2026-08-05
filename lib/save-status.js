const { isFormatOnSaveEnabled } = require("./app-interface");

const getFormatOnSaveStatus = () => (isFormatOnSaveEnabled() ? "enabled" : "disabled");

module.exports = getFormatOnSaveStatus;
