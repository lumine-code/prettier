const path = require("path");
const { execFile } = require("child_process");
const { log } = require("./log");

// Use the system git binary, honoring the editor's `git.path` setting when
// available (this module also runs inside Task processes without `atom`).
const getGitBinary = () => {
  const configured = typeof atom !== "undefined" && atom.config.get("git.path");
  return configured || "git";
};

const execGit = (args, workingDir) =>
  new Promise((resolve, reject) => {
    execFile(
      getGitBinary(),
      args,
      {
        cwd: workingDir,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const failure = new Error(
            stderr || `git ${args.join(" ")} failed: ${error.message || error}`,
          );
          failure.stdout = stdout;
          failure.stderr = stderr;
          reject(failure);
          return;
        }
        resolve({ stdout, stderr, exitCode: 0 });
      },
    );
  });

const getRepositoryPathForFile = async (filePath) => {
  if (!filePath) return;

  const fileDir = path.dirname(filePath);
  const { stdout } = await execGit(
    ["-c", "safe.directory=*", "rev-parse", "--show-toplevel"],
    fileDir,
  );
  return stdout.trim();
};

const refreshGitIndexForFiles = async (filePaths) => {
  const filesByRepository = new Map();

  for (const filePath of filePaths) {
    if (!filePath) continue;

    try {
      const repositoryPath = await getRepositoryPathForFile(filePath);
      if (!repositoryPath) continue;

      const relativePath = path.relative(repositoryPath, filePath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) continue;

      if (!filesByRepository.has(repositoryPath)) {
        filesByRepository.set(repositoryPath, new Set());
      }
      filesByRepository.get(repositoryPath).add(relativePath);
    } catch (error) {
      log("Git repository lookup skipped:", filePath, error.message);
    }
  }

  for (const [repositoryPath, relativePaths] of filesByRepository) {
    try {
      await execGit(
        ["-c", "safe.directory=*", "update-index", "--refresh", "--", ...relativePaths],
        repositoryPath,
      );
      log("Refreshed git index metadata:", repositoryPath, relativePaths.size, "file(s)");
    } catch (error) {
      log("Git index metadata refresh skipped:", repositoryPath, error.message);
    }
  }
};

const refreshGitIndexForFile = async (filePath) => {
  try {
    await refreshGitIndexForFiles([filePath]);
  } catch (error) {
    log("Git index metadata refresh skipped:", filePath, error.message);
  }
};

const refreshGitIndexForFileAfterSave = (editor, filePath) => {
  const buffer = editor && editor.getBuffer && editor.getBuffer();
  let subscription;
  let didRefresh = false;

  const refresh = () => {
    if (didRefresh) return;
    didRefresh = true;
    if (subscription) subscription.dispose();
    refreshGitIndexForFile(filePath);
  };

  if (buffer && buffer.onDidSave) {
    subscription = buffer.onDidSave(refresh);
    setTimeout(refresh, 1000);
  } else {
    setTimeout(refresh, 0);
  }
};

module.exports = {
  refreshGitIndexForFile,
  refreshGitIndexForFiles,
  refreshGitIndexForFileAfterSave,
};
