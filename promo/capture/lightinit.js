// Init script factory: force theme + appearance before the app's bootstrap reads localStorage.
module.exports = (theme = "light", mode = "default", custom = null) => `(() => {
  try {
    localStorage.setItem('gailvlun-theme', ${JSON.stringify(theme)});
    localStorage.setItem('gailvlun-appearance-v1', JSON.stringify(${JSON.stringify({ mode, ...(custom ? { custom } : {}) })}));
  } catch (e) {}
})();`;
