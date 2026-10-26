/* global emit -- provided by the Task handler runtime */
const path = require("path");
const fs = require("fs");
const { createPrettierService } = require("./prettier-service");
const { writeFormattedFile } = require("./atomic-file");
const { createErrorReport } = require("./project-budget");
const { INPUT_LIMIT, checkMessage } = require("./message-budget");
const { readBoundedFile } = require("./bounded-file");

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
    checkMessage({ event: "start", args: [projects, ignoreNodeModules] });
    const report = createErrorReport();

    for (const { projectPath, prettierPath, files } of projects) {
      const prettier = createPrettierService(prettierPath || undefined);

      const prettierignorePath = path.join(projectPath, ".prettierignore");
      const ignorePath = fs.existsSync(prettierignorePath) ? prettierignorePath : undefined;

      const allFiles = files || [];

      for (let i = 0; i < allFiles.length; i++) {
        if (i % BATCH_SIZE === 0 && i > 0) await yieldToUI();

        const filePath = allFiles[i];
        const progress = {
          projectPath,
          current: i + 1,
          total: allFiles.length,
          filePath,
        };
        checkMessage({ event: "prettier:format-progress", args: [progress] });
        emit("prettier:format-progress", progress);

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
            await writeFormattedFile(filePath, formatted, snapshot);
            totalFormatted++;
          }
        } catch (e) {
          report.add(filePath, e);
        }
      }
    }

    emit("prettier:format-done", report.result(totalFormatted));
  })()
    .catch((error) => {
      const report = createErrorReport();
      report.add("", error);
      emit("prettier:format-done", report.result());
    })
    .then(done);
};
