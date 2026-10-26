/* global emit -- provided by the Task handler runtime */
const path = require("path");
const fs = require("fs");
const { createPrettierService } = require("./prettier-service");
const { INPUT_LIMIT } = require("./message-budget");
const { readBoundedFile, sameFile } = require("./bounded-file");

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
          const snapshot = readBoundedFile(filePath, INPUT_LIMIT);
          const source = snapshot.text;
          const formatted = await prettier.format(source, { ...config, filepath: filePath });

          if (formatted !== source) {
            const current = readBoundedFile(filePath, INPUT_LIMIT);
            if (!sameFile(current.stat, snapshot.stat) || current.text !== source)
              throw new Error("Source changed during formatting; no changes were written.");
            fs.writeFileSync(filePath, formatted, "utf8");
            totalFormatted++;
          }
        } catch (e) {
          totalErrored++;
          if (errors.length < 1000)
            errors.push({ filePath, message: String(e.message).slice(0, 65536) });
        }
      }
    }

    emit("prettier:format-done", {
      totalFormatted,
      totalErrored,
      errors,
      omittedErrors: totalErrored - errors.length,
    });
  })()
    .catch((error) => {
      emit("prettier:format-done", {
        totalFormatted: 0,
        totalErrored: 1,
        errors: [{ filePath: "", message: String(error.message || error) }],
      });
    })
    .then(done);
};
