const { CompositeDisposable } = require("atom");
const path = require("path");
const observedFiles = require("./observed-files");

module.exports = class ObservedFilesList {
  constructor() {
    this.items = [];
    this.disposables = new CompositeDisposable();

    this.selectList = atom.workspace.buildSelectList({
      className: "prettier-observed-files-list",
      emptyMessage: "No files observed for format-on-save",
      placeholderText: "Observed format-on-save files...",
      helpMarkdown:
        "Available commands:\n" +
        "- **Enter**: Open file\n" +
        "- **Ctrl+D**: Stop observing selected file",
      willShow: () => this.update(),
      filterKeyForItem: (item) => item.displayPath,
      elementForItem: (item, { filterKey, highlight }) => {
        return {
          primary: highlight(filterKey),
          icon: ["icon-file-code"],
        };
      },
      didConfirmSelection: (item) => {
        this.selectList.hide();
        atom.workspace.open(item.filePath, { searchAllPanes: true });
      },
      didCancelSelection: () => {
        this.selectList.hide();
      },
    });

    this.disposables.add(
      atom.commands.add(this.selectList.element, {
        "prettier:unobserve-selected-file": () => this.unobserveSelectedFile(),
      }),
    );
  }

  buildItems() {
    return observedFiles.getObservedFiles().map((filePath) => ({
      filePath,
      displayPath: this.displayPath(filePath),
    }));
  }

  displayPath(filePath) {
    const [projectPath, relativePath] = atom.project.relativizePath(filePath);
    if (projectPath && relativePath) {
      return relativePath;
    }
    return filePath;
  }

  update(initialSelectionIndex = null) {
    this.items = this.buildItems();
    const updateOptions = { items: this.items };
    if (initialSelectionIndex != null) {
      updateOptions.initialSelectionIndex = initialSelectionIndex;
    }
    this.selectList.update(updateOptions);
  }

  unobserveSelectedFile() {
    const item = this.selectList.getSelectedItem();
    if (!item) {
      return;
    }

    const index = this.selectList.selectionIndex ?? 0;
    observedFiles.setObserved(item.filePath, false);
    atom.notifications.addInfo(`Stopped observing ${path.basename(item.filePath)}`);

    this.update(Math.max(0, Math.min(index, this.items.length - 2)));
    if (this.items.length === 0) {
      this.selectList.hide();
    }
  }

  show() {
    this.selectList.show();
  }

  toggle() {
    this.selectList.toggle();
  }

  destroy() {
    this.disposables.dispose();
    this.selectList.destroy();
  }
};
