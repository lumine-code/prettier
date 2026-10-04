const readPkgUp = require("./read-pkg-up");
const path = require("path");

const isPrettierInPackageJson = (filePath) => {
  const cwd = filePath && path.dirname(filePath);
  if (!cwd) return false;
  const result = readPkgUp(cwd);
  const pkg = result.packageJson || {};
  return (
    Object.hasOwn(pkg.dependencies || {}, "prettier") ||
    Object.hasOwn(pkg.devDependencies || {}, "prettier")
  );
};

module.exports = isPrettierInPackageJson;
