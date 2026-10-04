let delegate = null;
const set = (value) => {
  delegate = value;
};
const get = () => delegate;
const clear = (request) => {
  if (request.path) delegate?.setMessages(request.path, []);
};
const report = (error, request) => {
  if (!request.path || !delegate) return;
  const loc = error.loc?.start ?? error.loc;
  if (!Number.isInteger(loc?.line)) return;
  const point = [Math.max(0, loc.line - 1), Math.max(0, (loc.column ?? 1) - 1)];
  delegate.setMessages(request.path, [
    {
      location: { file: request.path, position: [point, point] },
      excerpt: error.message,
      severity: "error",
    },
  ]);
};
module.exports = { set, get, clear, report };
