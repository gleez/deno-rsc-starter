// Read generated file
const code = await Deno.readTextFile("./dist/rsc/index.mjs");


// Replace .js → .mjs in dynamic imports
// const updatedCode = code.replace(
//   /(const ssrEntryModule = await import\([^)]*)\.js(\))/,
//   '$1.mjs$2'
// );

const updatedCode = code.replace(
  /await import\(\s*["']([^"']*)\.js["']\s*\)/g,
  (_, pathWithoutExt) => `await import("${pathWithoutExt}.mjs")`
);

// Write back
await Deno.writeTextFile("./dist/rsc/index.mjs", updatedCode);