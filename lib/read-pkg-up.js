const fs = require("fs");
const path = require("path");

const readPkgUp = (cwd) => {
  let dir = cwd;
  const { root } = path.parse(dir);
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    try {
      const packageJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      return { packageJson, path: pkgPath };
    } catch {
      // not found, continue
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) return {};
    dir = parent;
  }
};

module.exports = readPkgUp;
