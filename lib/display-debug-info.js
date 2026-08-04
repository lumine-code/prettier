const path = require("path");
const readPkgUp = require("./read-pkg-up");
const {
  getEditorVersion,
  getPrettierAtomConfig,
  addInfoNotification,
} = require("./atom-interface");
const { getGlobalPrettierPath } = require("./get-prettier-path");

const getDepPath = (dep) => path.join(__dirname, "..", "node_modules", dep);

const getPackageInfo = (dir) => {
  const result = readPkgUp(dir);
  return result.packageJson || {};
};

const getDebugInfo = () => {
  const globalPrettierPath = getGlobalPrettierPath();
  return `
Lumine version: ${getEditorVersion()}
prettier version: ${getPackageInfo(__dirname).version}
prettier: ${globalPrettierPath || "bundled"}
prettier version: ${getPackageInfo(globalPrettierPath || getDepPath("prettier")).version}
prettier configuration: ${JSON.stringify(getPrettierAtomConfig(), null, 2)}
`.trim();
};

const displayDebugInfo = () =>
  addInfoNotification("prettier: diagnostics", {
    detail: getDebugInfo(),
    dismissable: true,
  });

module.exports = displayDebugInfo;
