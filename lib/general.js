const picomatch = require("picomatch");
const path = require("path");
const fs = require("fs");

const isPresent = (target) =>
  !!target && (typeof target.length === "undefined" || target.length > 0);

// Two things picomatch will not do for us that minimatch did:
//
// - `picomatch.isMatch` is the raw matcher, below the wrapper that infers the
//   platform, so a Windows path has to be normalized by hand.
// - `basename` is unconditional, unlike minimatch's `matchBase`, which applies
//   only to a pattern with no slash in it. Setting it always would stop
//   `**/dist/**` from ever matching, since only `bundle.js` would be compared.
const someGlobsMatchFilePath = (globs, filePath) => {
  if (!isPresent(filePath)) return false;
  const normalizedFilePath = process.platform === "win32" ? filePath.replace(/\\/g, "/") : filePath;
  return globs.some((glob) =>
    picomatch.isMatch(normalizedFilePath, glob, {
      dot: true,
      basename: !glob.includes("/"),
    }),
  );
};

const getDirFromFilePath = (filePath) => {
  if (typeof filePath !== "string" || filePath.length === 0) return undefined;
  return path.parse(filePath).dir;
};

// Walk up directories from `dir` looking for `name` (file or relative path).
// Stops at `stopAt` directory (inclusive) if provided, otherwise walks to fs root.
const findCached = (dir, name, stopAt) => {
  if (!dir) return undefined;
  const names = Array.isArray(name) ? name : [name];
  let current = path.resolve(dir);
  const { root } = path.parse(current);
  const boundary = stopAt ? path.resolve(stopAt) : null;
  while (true) {
    for (const n of names) {
      const candidate = path.join(current, n);
      try {
        fs.accessSync(candidate);
        return candidate;
      } catch {
        // not found, continue
      }
    }
    if (boundary && current === boundary) return undefined;
    const parent = path.dirname(current);
    if (parent === current || current === root) return undefined;
    current = parent;
  }
};

const findCachedFromFilePath = (filePath, name, stopAt) => {
  const dirPath = getDirFromFilePath(filePath);
  return isPresent(dirPath) ? findCached(dirPath, name, stopAt) : undefined;
};

module.exports = {
  isPresent,
  someGlobsMatchFilePath,
  getDirFromFilePath,
  findCached,
  findCachedFromFilePath,
};
