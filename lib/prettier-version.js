const { addErrorNotification } = require("./app-interface");
const getPrettierInstance = require("./get-prettier-instance");

let errorShown = false;
const displayImproperPrettierVersionError = () => {
  if (errorShown) return;
  errorShown = true;
  addErrorNotification(
    "Your Prettier version is not compatible with prettier. Prettier must be >= 1.13.4",
    {
      dismissable: true,
      detail:
        "Please run `npm install prettier` (or `yarn add prettier`) in your local repo or " +
        "`npm install --global prettier` (`yarn global add prettier`) to " +
        "update to a compatible version of Prettier. Note that you will need to reload Lumine for " +
        "the change to be picked up.",
    },
  );
};

const isCompatiblePrettier = (prettier) => typeof prettier.getFileInfo === "function";

const isPrettierProperVersion = (editor) => {
  const prettier = getPrettierInstance(editor);
  const ok = isCompatiblePrettier(prettier);
  if (!ok) displayImproperPrettierVersionError();
  return ok;
};

module.exports = isPrettierProperVersion;
