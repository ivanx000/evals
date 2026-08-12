"use strict";

// Hand-written plain JS, never processed by tsc — CommonJS files are allowed
// to use native import() (that's the whole reason dynamic import exists), but
// tsc's `module: commonjs` target downlevels a literal `import()` written in
// a .ts file into `require()`, which can't load ESM plugin files. Keeping
// this call in an untranspiled .js file preserves it as a real dynamic
// import at runtime.
module.exports.dynamicImport = function dynamicImport(specifier) {
  return import(specifier);
};
