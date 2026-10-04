# prettier

Format files using Prettier.

Provides the Prettier engine to `code-format`, which owns editor commands, save hooks and applying results. Project and tree-selection formatting remain explicit Prettier operations on disk.

## Features

- **Formatting provider**: format documents and selections through the shared hub with full syntax context.
- **Engine resolution**: use the project's Prettier, a global installation, or bundled Prettier 3.
- **Configuration**: read standard Prettier configuration and honor `.prettierignore`.
- **Project formatting**: format supported files in open projects or selected files and folders from the tree view.
- **Safe results**: calculate changes from immutable snapshots without modifying editors or cursors.
- **Linter diagnostics**: report Prettier syntax errors with source locations.
- **Lazy worker**: run the engine in a shared child process only when requested.

## Installation

To install `prettier` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/prettier`.

Install and enable `code-format` for formatting open editors. Configure formatting on save, path filters and observed files in that package.

## Commands

Commands available in `lumine-workspace`:

- `prettier:format`: ask the hub to format the active document or selections specifically with Prettier,
- `prettier:format-selected`: format selected project files or folders from the tree view,
- `prettier:format-projects`: format supported files in all open projects,
- `prettier:show-diagnostics`: show the current file's resolved Prettier version and configuration.

## Usage

Engine resolution checks the file's directory up to its project root, then uses the bundled engine. Enable global discovery to search npm and Yarn installations before the bundled fallback; this opt-in can delay the first request. Global discovery runs asynchronously and is shared across requests. The worker starts lazily and is reused across editors.

Select `prettier` as the default formatter in `code-format` when it should take precedence over language-server formatting. An observed file bypasses the hub's save policy, but still respects this provider's ignore and project requirements.

## Services

- `code-format.file`: provided to calculate whole-document formatting plans.
- `code-format.range`: provided to format selections with surrounding syntax context.
- `code-format.executor`: consumed to delegate the explicit Prettier editor command to the hub.
- `busy-signal`: consumed to report project formatting progress.
- `linter.registry`: consumed to report syntax errors.
- `tree-view.selection`: consumed to resolve selected project files and folders.
- `background-tips.provider`: provided to teach the explicit Prettier command.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
