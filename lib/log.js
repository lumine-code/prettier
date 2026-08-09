const PACKAGE_NAME = "prettier";

function log(...args) {
  if (typeof lumine !== "undefined" && lumine.config.get(`${PACKAGE_NAME}.debug`)) {
    console.log(`[${PACKAGE_NAME}]`, ...args);
  }
}

module.exports = { log };
