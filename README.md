# prettier

Format files using Prettier.

Formatting is provided by [Prettier](https://prettier.io).

## Features

- **Format on command**: format the active editor via `prettier:format`.
- **Format projects**: format all files in open projects; walks every project directory, skips files that Prettier doesn't handle or that `.prettierignore` excludes, and writes back only changed files.
- **Format selected**: format selected files or folders from the tree view.
- **Format on save**: automatically format files when saving, with fine-grained control over which files to include or exclude.
- **Observed files**: opt individual files into format-on-save regardless of the global switch and glob settings, and review them in a searchable list with a status-bar counter.
- **Glob filtering**: include or exclude files from format-on-save using glob patterns.
- **Prettier config support**: reads all standard Prettier config formats (`.prettierrc`, `.prettierrc.json`, `.prettierrc.js`, `prettier.config.js`, `package.json`, etc.) via Prettier's built-in `resolveConfig`.
- **Status bar indicator**: optional status bar tile showing format-on-save state.
- **Linter integration**: reports Prettier errors via the linter interface.
- **Bundled Prettier 3**: ships with Prettier 3 and runs it in a child process to avoid Electron compatibility issues.

## Installation

To install `prettier` search for _prettier_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/prettier`.

## Commands

Commands available in `atom-workspace`:

- `prettier:format`: format the active editor,
- `prettier:format-projects`: format all files in open projects,
- `prettier:toggle`: toggle format on save,
- `prettier:toggle-observed`: observe or stop observing the active file for format-on-save,
- `prettier:observed-files`: list the files observed for format-on-save,
- `prettier:clear-all-observed-files`: stop observing every file at once,
- `prettier:show-diagnostics`: show diagnostic information.

Commands available in `.tree-view`:

- `prettier:format-selected`: format selected files or folders from the tree view.

## Usage

Prettier runs in a **child process** (`child_process.fork`) so that Prettier 3's async API works correctly inside Electron's renderer. The child process is spawned lazily on first format and shared across all editors.

Prettier resolution order:

1. **Local**: walks up from the file's directory (bounded by the project root) looking for `node_modules/prettier/index.cjs` or `index.js`.
2. **Global**: checks global npm and Yarn module paths.
3. **Bundled**: falls back to the Prettier version shipped with this package.

Enable **Debug Mode** in settings to log Prettier detection, resolution paths, and formatting details to the developer console.

Observed files are an addition to the format-on-save settings, not a replacement: a file marked as observed is formatted on every save even when **Format Files on Save** is off or the glob, `.eslintignore`, `package.json` and config-file requirements would have excluded it. The checks that decide whether Prettier can handle the file at all still apply. Alt-click the status-bar tile or run `prettier:toggle-observed` to mark the active file. A second status-bar item on the right shows how many files are currently observed and is hidden when there are none. Left click it to open the observed-files list, where **Enter** opens the selected file and **Ctrl+D** stops observing it; right click clears every observed file at once. Observed files are not remembered between sessions.

## Customization

The status-bar items can be restyled from your `styles.less`, e.g.:

```less
.prettier-observed-status {
  color: var(--text-color-info);
}
```

## Services

- **status-bar** (`^1.0.0`): consumed to show the optional format-on-save status tile and the observed-file count.
- **busy-signal.reporter** (`^1.0.0`): consumed to report progress while project formats are running.
- **linter-indie** (`^1.0.0`): consumed to report Prettier formatting errors as linter messages.
- **tree-view** (`^1.0.0`): consumed to resolve the selected files or folders for `prettier:format-selected`.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
