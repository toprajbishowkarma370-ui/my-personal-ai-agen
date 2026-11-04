// Minimal TypeScript loader for the Node test runner (Node 20 compatible).
// The tests execute the REAL lib/*.ts modules instead of re-implementing their
// logic, so assertions cover shipped code, not a simulation of it.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function resolveModuleFile(specifier, fromDir) {
  const base = path.resolve(fromDir, specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function loadTsModule(entryFile) {
  const cache = new Map();

  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;

    const source = fs.readFileSync(absolute, "utf8");
    const output = ts.transpileModule(source, {
      fileName: absolute,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;

    const module = { exports: {} };
    cache.set(absolute, module);

    const localRequire = (request) => {
      if (request.startsWith(".") || request.startsWith("/")) {
        const resolved = resolveModuleFile(request, path.dirname(absolute));
        if (!resolved) {
          throw new Error(`Cannot resolve "${request}" from ${absolute}`);
        }
        return load(resolved);
      }
      return require(request);
    };

    new Function("exports", "require", "module", "__filename", "__dirname", output)(
      module.exports,
      localRequire,
      module,
      absolute,
      path.dirname(absolute),
    );

    return module.exports;
  }

  return load(entryFile);
}

module.exports = { loadTsModule };
