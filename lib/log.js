const PACKAGE_NAME = "prettier";

function log(...args) {
  if (typeof atom !== "undefined" && atom.config.get(`${PACKAGE_NAME}.debug`)) {
    console.log(`[${PACKAGE_NAME}]`, ...args);
  }
}

module.exports = { log };
