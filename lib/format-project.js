const path = require("path");
const fs = require("fs");
const { getLocalOrGlobalPrettierPath } = require("./get-prettier-path");
const { createPrettierService } = require("./prettier-service");
const { shouldIgnoreNodeModules } = require("./app-interface");
const { log } = require("./log");
const { refreshGitIndexForFiles } = require("./refresh-git-index");
const collectProjectFiles = require("./collect-project-files");

function getPrettierForProject(projectPath) {
  const syntheticFilePath = path.join(projectPath, "__dummy__");
  const prettierPath = getLocalOrGlobalPrettierPath(syntheticFilePath, projectPath);
  const service = createPrettierService(prettierPath || undefined);
  log("Project prettier:", projectPath, "\u2192", prettierPath || "bundled", "v" + service.version);
  return service;
}

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function formatProject(projectPath, options = {}) {
  const { onProgress } = options;
  const ignoreNodeModules = shouldIgnoreNodeModules();

  const prettier = getPrettierForProject(projectPath);

  const prettierignorePath = path.join(projectPath, ".prettierignore");
  const ignorePath = fs.existsSync(prettierignorePath) ? prettierignorePath : undefined;

  log(
    "Walking project:",
    projectPath,
    ignorePath ? "(has .prettierignore)" : "(no .prettierignore)",
  );

  const allFiles = await collectProjectFiles([projectPath], ignoreNodeModules);
  log("Files found:", allFiles.length);

  const results = { formatted: 0, skipped: 0, errored: 0, errors: [] };
  const formattedFiles = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < allFiles.length; i++) {
    if (i % BATCH_SIZE === 0 && i > 0) await yieldToUI();

    const filePath = allFiles[i];

    if (onProgress) {
      onProgress({ current: i + 1, total: allFiles.length, filePath });
    }

    try {
      const fileInfo = await prettier.getFileInfo(filePath, {
        withNodeModules: !ignoreNodeModules,
        ignorePath,
      });

      if (!fileInfo.inferredParser || fileInfo.ignored) {
        results.skipped++;
        continue;
      }

      const config = (await prettier.resolveConfig(filePath)) || {};
      const source = fs.readFileSync(filePath, "utf8");
      const formatted = await prettier.format(source, {
        ...config,
        filepath: filePath,
      });

      if (formatted !== source) {
        fs.writeFileSync(filePath, formatted, "utf8");
        formattedFiles.push(filePath);
        results.formatted++;
        log("Formatted:", filePath);
      } else {
        results.skipped++;
      }
    } catch (e) {
      results.errored++;
      results.errors.push({ filePath, message: e.message });
      log("Error formatting:", filePath, e.message);
    }
  }

  await refreshGitIndexForFiles(formattedFiles);

  log(
    "Project done:",
    projectPath,
    `formatted=${results.formatted} skipped=${results.skipped} errors=${results.errored}`,
  );
  return results;
}

module.exports = formatProject;
