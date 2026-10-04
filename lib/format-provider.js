const { TextBuffer } = require("lumine");
const defaultGetPrettierInstance = require("./get-prettier-instance");
const { getProjectRootForFile } = require("./app-interface");
const { findCachedFromFilePath } = require("./general");
const isPrettierInPackageJson = require("./prettier-in-pkg");
const isFilePathEslintIgnored = require("./eslint-ignored");

function createFormatProvider({
  getPrettierInstance = defaultGetPrettierInstance,
  onError = () => {},
  onSuccess = () => {},
} = {}) {
  // Eligibility and config resolution belong to a request, rather than a live
  // editor. The hub asks canFormat before invoking either formatting service.
  const contexts = new WeakMap();

  const current = (editor, request) =>
    !request.signal?.aborted &&
    request.isCurrent() &&
    !editor.isDestroyed() &&
    editor.getPath() === request.path &&
    editor.getText() === request.text;

  const getContext = (editor, request) => {
    if (!request || !request.path || !current(editor, request)) return Promise.resolve(null);
    if (contexts.has(request)) return contexts.get(request);

    const context = (async () => {
      try {
        const setting = (name) =>
          lumine.config.get(`prettier.${name}`, { scope: editor.getRootScopeDescriptor() });
        const filePath = request.path;
        const projectRoot = getProjectRootForFile(filePath);
        // The engine resolver must see the snapshot's path even if the editor
        // is renamed while asynchronous work is pending.
        const pathEditor = { buffer: { file: { getPath: () => filePath } } };
        if (setting("requireProjectDependency") && !isPrettierInPackageJson(pathEditor))
          return null;
        if (setting("respectEslintignore") && isFilePathEslintIgnored(filePath, projectRoot))
          return null;

        const prettier = await getPrettierInstance(pathEditor);
        if (!current(editor, request)) return null;
        const fileInfo = await prettier.getFileInfo(
          filePath,
          {
            withNodeModules: !setting("ignoreNodeModules"),
            ignorePath: findCachedFromFilePath(filePath, ".prettierignore", projectRoot),
          },
          request.signal,
        );
        if (!current(editor, request) || !fileInfo?.inferredParser || fileInfo.ignored) return null;

        const config = await prettier.resolveConfig(filePath, request.signal);
        if (!current(editor, request) || (setting("requireConfig") && config == null)) return null;
        return { prettier, options: { ...config, filepath: filePath } };
      } catch (error) {
        if (!current(editor, request)) return null;
        onError(error, request);
        throw error;
      }
    })();
    contexts.set(request, context);
    return context;
  };

  const format = async (editor, request, context, text, rangeOptions = {}) => {
    if (!current(editor, request)) return null;
    try {
      const formatted = await context.prettier.format(
        text,
        { ...context.options, ...rangeOptions },
        request.signal,
      );
      if (!current(editor, request)) return null;
      if (typeof formatted !== "string") throw new TypeError("Prettier returned invalid text.");
      return formatted;
    } catch (error) {
      if (!current(editor, request)) return null;
      onError(error, request);
      throw error;
    }
  };

  const result = (editor, request, text, fullText) => {
    if (!current(editor, request)) return null;
    if (text === request.text) {
      onSuccess(request);
      return [];
    }
    const edits = editor.getBuffer().getChangesToText(text);
    if (!current(editor, request)) return null;
    onSuccess(request);
    return fullText ? { text, edits, isCurrent: () => current(editor, request) } : edits;
  };

  return {
    packageName: "prettier",
    priority: 1,

    async canFormat(editor, request) {
      return !!(await getContext(editor, request)) && current(editor, request);
    },

    async formatEntireFile(editor, request) {
      const context = await getContext(editor, request);
      if (!context) return null;
      const text = await format(editor, request, context, request.text);
      return text == null ? null : result(editor, request, text, true);
    },

    async formatCode(editor, range, request) {
      const context = await getContext(editor, request);
      if (!context || !current(editor, request)) return null;
      const ranges = request.ranges?.length ? request.ranges : [range];
      if (ranges.length === 1) {
        const buffer = editor.getBuffer();
        const selectedRange = ranges[0];
        const text = await format(editor, request, context, request.text, {
          rangeStart: buffer.characterIndexForPosition(selectedRange.start ?? selectedRange[0]),
          rangeEnd: buffer.characterIndexForPosition(selectedRange.end ?? selectedRange[1]),
        });
        return text == null ? null : result(editor, request, text, false);
      }

      // Prettier may expand a range to its containing statement. Formatting
      // every selection against the original source would produce overlapping
      // edits. A private buffer remaps the remaining selections as we format,
      // then the hub receives one final plan against its untouched snapshot.
      const buffer = new TextBuffer({ text: request.text });
      try {
        const markers = ranges.map((selectedRange) =>
          buffer.markRange(selectedRange, { invalidate: "never" }),
        );
        for (const marker of markers) {
          const selectedRange = marker.getRange();
          const text = await format(editor, request, context, buffer.getText(), {
            rangeStart: buffer.characterIndexForPosition(selectedRange.start),
            rangeEnd: buffer.characterIndexForPosition(selectedRange.end),
          });
          if (text == null) return null;
          buffer.setTextViaDiff(text);
        }
        return result(editor, request, buffer.getText(), true);
      } finally {
        buffer.destroy();
      }
    },
  };
}

module.exports = { createFormatProvider };
