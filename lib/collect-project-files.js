const fs = require("fs");
const { FILE_LIMIT, createCollectionBudget } = require("./project-budget");
const { budgetError } = require("./message-budget");

// Gathers the files to format under `targetPaths`.
//
// Directories go through `lumine.project.crawl()`, so the editor's ripgrep does
// the walking and `.gitignore` applies unless the user turns
// `prettier.excludeVcsIgnoredPaths` off. Explicit file targets — a tree-view
// selection, say — are taken as given.
//
// `.prettierignore` is deliberately not consulted here: prettier's own
// `getFileInfo({ ignorePath })` reports it per file, and that stays the
// authority on what prettier will not format.
module.exports = async function collectProjectFiles(
  targetPaths,
  ignoreNodeModules,
  { budget = createCollectionBudget(), signal } = {},
) {
  if (targetPaths.length > FILE_LIMIT) throw budgetError("Project target count");
  signal?.throwIfAborted();
  const directoryPaths = [],
    files = new Set();
  const add = (filePath) => {
    if (files.has(filePath)) return;
    budget.add(filePath);
    files.add(filePath);
  };
  let deadline = performance.now() + 4;
  for (const targetPath of targetPaths) {
    if (performance.now() >= deadline) {
      await new Promise((resolve) => setImmediate(resolve));
      deadline = performance.now() + 4;
    }
    signal?.throwIfAborted();
    let directory;
    try {
      directory = fs.statSync(targetPath).isDirectory();
    } catch {
      continue;
    }
    if (directory) directoryPaths.push(targetPath);
    else add(targetPath);
  }
  if (directoryPaths.length) {
    let crawl, failure;
    const cancel = () => crawl?.cancel?.();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      crawl = lumine.project.crawl({
        directoryPaths,
        ignoredNames: ignoreNodeModules ? ["node_modules"] : [],
        excludeVcsIgnoredPaths: lumine.config.get("prettier.excludeVcsIgnoredPaths"),
        didFindPaths(paths) {
          if (failure || signal?.aborted) return;
          try {
            for (const filePath of paths) add(filePath);
          } catch (error) {
            failure = error;
            cancel();
          }
        },
      });
      if (failure || signal?.aborted) cancel();
      await crawl;
      if (failure) throw failure;
      signal?.throwIfAborted();
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
  return Array.from(files);
};
