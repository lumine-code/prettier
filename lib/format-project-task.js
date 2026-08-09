/* global emit -- provided by the Task handler runtime */
const path = require("path");
const fs = require("fs");
const { createPrettierService } = require("./prettier-service");
const { refreshGitIndexForFiles } = require("./refresh-git-index");

const BATCH_SIZE = 5;

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// projects = [{ projectPath, prettierPath, files }]
//
// The file lists are gathered by the caller through `lumine.project.crawl()`, so
// this handler only formats: it never walks the filesystem itself.
module.exports = function (projects, ignoreNodeModules) {
  const done = this.async();

  (async () => {
    let totalFormatted = 0;
    let totalErrored = 0;
    const errors = [];

    for (const { projectPath, prettierPath, files } of projects) {
      const prettier = createPrettierService(prettierPath || undefined);
      const formattedFiles = [];

      const prettierignorePath = path.join(projectPath, ".prettierignore");
      const ignorePath = fs.existsSync(prettierignorePath) ? prettierignorePath : undefined;

      const allFiles = files || [];

      for (let i = 0; i < allFiles.length; i++) {
        if (i % BATCH_SIZE === 0 && i > 0) await yieldToUI();

        const filePath = allFiles[i];
        emit("prettier:format-progress", {
          projectPath,
          current: i + 1,
          total: allFiles.length,
          filePath,
        });

        try {
          const fileInfo = await prettier.getFileInfo(filePath, {
            withNodeModules: !ignoreNodeModules,
            ignorePath,
          });

          if (!fileInfo.inferredParser || fileInfo.ignored) continue;

          const config = (await prettier.resolveConfig(filePath)) || {};
          const source = fs.readFileSync(filePath, "utf8");
          const formatted = await prettier.format(source, { ...config, filepath: filePath });

          if (formatted !== source) {
            fs.writeFileSync(filePath, formatted, "utf8");
            formattedFiles.push(filePath);
            totalFormatted++;
          }
        } catch (e) {
          totalErrored++;
          errors.push({ filePath, message: e.message });
        }
      }

      await refreshGitIndexForFiles(formattedFiles);
    }

    emit("prettier:format-done", { totalFormatted, totalErrored, errors });
  })()
    .catch((error) => {
      emit("prettier:format-done", {
        totalFormatted: 0,
        totalErrored: 0,
        errors: [{ filePath: "", message: String(error.message || error) }],
      });
    })
    .then(done);
};
