const { CompositeDisposable } = require("lumine");
const path = require("path");
const observedFiles = require("./observed-files");

module.exports = class ObservedFilesList {
  constructor() {
    this.items = [];
    this.disposables = new CompositeDisposable();

    this.selectList = lumine.workspace.buildSelectList({
      className: "prettier-observed-files-list",
      crumb: "Observed Files",
      emptyMessage: "No files observed for format-on-save",
      placeholderText: "Observed format-on-save files...",
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
        lumine.workspace.open(item.filePath, { searchAllPanes: true });
      },
      didCancelSelection: () => {
        this.selectList.hide();
      },
    });

    // The item-actions list (F12) derives its rows — label, description,
    // keybinding — from this registration and the keymap.
    this.disposables.add(
      lumine.commands.add(this.selectList.element, {
        "prettier:unobserve-selected-file": {
          description: "Stop formatting the selected file on save and drop it from this list",
          didDispatch: () => this.unobserveSelectedFile(),
        },
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
    const [projectPath, relativePath] = lumine.project.relativizePath(filePath);
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
    lumine.notifications.addHint(`Stopped observing ${path.basename(item.filePath)}`);

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
