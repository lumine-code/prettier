const { readBoundedFile } = require("./bounded-file");
const path = require("path");

const readPkgUp = (cwd) => {
  let dir = cwd;
  const { root } = path.parse(dir);
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    try {
      const packageJson = JSON.parse(readBoundedFile(pkgPath, 1024 * 1024).text);
      return { packageJson, path: pkgPath };
    } catch (error) {
      if (error.code === "ERR_PRETTIER_BUDGET") throw error;
      // not found, continue
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) return {};
    dir = parent;
  }
};

module.exports = readPkgUp;
