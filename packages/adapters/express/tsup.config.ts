export default {
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,

  bundle: true,

  external: ["@limitkit/core"],

  // Force http to be bundled (inlined)
  noExternal: ["@limitkit/http"],
};
