# prettier-plus

Pulsar plugin for formatting files using [Prettier](https://prettier.io).

Fork of [prettier-atom](https://github.com/prettier/prettier-atom).

## Features

- **Format on command**: Format the active editor via `prettier-plus:format`.
- **Format projects**: Format all files in open projects via `prettier-plus:format-projects`. Walks every project directory, skips files that Prettier doesn't handle or that `.prettierignore` excludes, and writes back only changed files. Progress is reported in a notification.
- **Format selected**: Format selected files or folders from the tree view via `prettier-plus:format-selected`.
- **Format on save**: Automatically format files when saving, with fine-grained control over which files to include or exclude.
- **Glob filtering**: Include or exclude files from format-on-save using glob patterns.
- **Respect `.eslintignore`**: Optionally skip files listed in `.eslintignore`.
- **Prettier config support**: Reads all standard Prettier config formats (`.prettierrc`, `.prettierrc.json`, `.prettierrc.js`, `prettier.config.js`, `package.json`, etc.) via Prettier's built-in `resolveConfig`.
- **Status bar indicator**: Optional status bar tile showing format-on-save state.
- **Linter integration**: Reports Prettier errors via the `linter` service.
- **Debug mode**: Enable `Debug Mode` in settings to log Prettier detection, resolution paths, and formatting details to the developer console.
- **Prettier 3**: Ships with Prettier 3 and runs it in a child process to avoid Electron compatibility issues.
- **Lightweight**: Simplified fork with minimal dependencies. No bundled ESLint or Stylelint, no lodash, no forced packages.

## Installation

To install `prettier-plus` search for [prettier-plus](https://web.pulsar-edit.dev/packages/prettier-plus) in the Install pane of the Pulsar settings or run `ppm install prettier-plus`. Alternatively, you can run `ppm install asiloisad/pulsar-prettier-plus` to install a package directly from the GitHub repository.

## Commands

Commands available in `atom-workspace`:

- `prettier-plus:format-projects`: format all files in open projects,
- `prettier-plus:toggle`: toggle format on save,
- `prettier-plus:show-diagnostics`: show diagnostic information.

Commands available in `atom-text-editor`:

- `prettier-plus:format`: format the active editor.

Commands available in `.tree-view`:

- `prettier-plus:format-selected`: format selected files or folders from the tree view.

## How it works

Prettier runs in a **child process** (`child_process.fork`) so that Prettier 3's async API works correctly inside Electron's renderer. The child process is spawned lazily on first format and shared across all editors.

Prettier resolution order:

1. **Local**: walks up from the file's directory (bounded by the project root) looking for `node_modules/prettier/index.cjs` or `index.js`.
2. **Global**: checks global npm and Yarn module paths.
3. **Bundled**: falls back to the Prettier version shipped with this package.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
