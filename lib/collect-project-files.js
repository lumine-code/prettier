const fs = require("fs");

// Gathers the files to format under `targetPaths`.
//
// Directories go through `atom.project.crawl()`, so the editor's ripgrep does
// the walking and `.gitignore` applies unless the user turns
// `prettier.excludeVcsIgnoredPaths` off. Explicit file targets — a tree-view
// selection, say — are taken as given.
//
// `.prettierignore` is deliberately not consulted here: prettier's own
// `getFileInfo({ ignorePath })` reports it per file, and that stays the
// authority on what prettier will not format.
module.exports = async function collectProjectFiles(targetPaths, ignoreNodeModules) {
  const directoryPaths = [];
  const files = new Set();

  for (const targetPath of targetPaths) {
    try {
      if (fs.statSync(targetPath).isDirectory()) {
        directoryPaths.push(targetPath);
      } else {
        files.add(targetPath);
      }
    } catch {
      // unreadable target, skip it
    }
  }

  if (directoryPaths.length) {
    // `.git`, `.hg` and `.svn` are excluded by the crawler itself.
    const ignoredNames = ignoreNodeModules ? ["node_modules"] : [];
    await atom.project.crawl({
      directoryPaths,
      ignoredNames,
      excludeVcsIgnoredPaths: atom.config.get("prettier.excludeVcsIgnoredPaths"),
      didFindPaths: (paths) => {
        for (const filePath of paths) files.add(filePath);
      },
    });
  }

  return Array.from(files);
};
