const fs = require("fs/promises");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

/**
 * Root directory of the Nest package source.
 * This is where imports will be temporarily rewritten.
 */
const NEST_SRC = path.resolve(__dirname, "libs/limit/src");

/**
 * Root directory of the Nest package source.
 * This is where imports will be temporarily rewritten.
 */
const HTTP_SRC = path.resolve(__dirname, "../http/src");

/**
 * Temporary destination inside the Nest package where HTTP utilities are copied.
 * This folder is created before build and removed afterward.
 */
const DEST = path.join(NEST_SRC, "http");

/**
 * Recursively collect all file paths inside a directory.
 *
 * @param {string} dir - Directory to traverse
 * @returns {Promise<string[]>} List of absolute file paths
 */
async function getAllFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? getAllFiles(fullPath) : fullPath;
    }),
  );

  return files.flat();
}

/**
 * Copy the entire HTTP source directory into the Nest package.
 *
 * This allows the Nest build (which uses `tsc` and does not bundle)
 * to resolve HTTP utilities via relative imports.
 *
 * The copied files are temporary and will be deleted after build.
 */
async function copyHttp() {
  const files = await getAllFiles(HTTP_SRC);

  for (const file of files) {
    const relative = path.relative(HTTP_SRC, file);
    const destPath = path.join(DEST, relative);

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(file, destPath);
  }
}

/**
 * Rewrite import paths inside the Nest source directory.
 *
 * This replaces references to the external package "@limitkit/http"
 * with a local import ("@limitkit/nest/http") so that the Nest compiler
 * can resolve the copied files without requiring a published package.
 *
 * To avoid complexity with resolving relative imports, ensure this is included in `tsconfig.json`:
 * ```json
 * {
 *    "compilerOptions": {
 *       "paths": {
 *           "@limitkit/nest": ["libs/limit/src/index.ts"],
 *           "@limitkit/nest/*": ["libs/limit/src/*"]
 *       }
 *    }
 * }
 * ```
 *
 * After the build completes, the rewrite is reverted.
 *
 * @param {string} from - Original import path (e.g., "@limitkit/http")
 * @param {string} to - Replacement import path (e.g., "@limitkit/nest/http")
 */
async function rewriteNestImports(from, to) {
  const files = await getAllFiles(NEST_SRC);

  for (const file of files) {
    if (!file.endsWith(".ts")) continue;

    let content = await fs.readFile(file, "utf-8");

    const replaced = content.replace(new RegExp(from, "g"), to);

    await fs.writeFile(file, replaced);
  }
}

/**
 * Remove the temporary HTTP directory from the Nest package.
 *
 * This ensures no copied files are committed or published.
 */
async function cleanup() {
  await fs.rm(DEST, { recursive: true, force: true });
}

/**
 * Execute the Nest build command.
 *
 * Uses Nest CLI (tsc-based build) to compile the package.
 */
async function runBuild() {
  const { stdout, stderr } = await execAsync("nest build limit");
  console.log(stdout);
  if (stderr) console.error(stderr);
}

/**
 * Main build pipeline:
 *
 * 1. Copy HTTP utilities into Nest package
 * 2. Rewrite Nest imports to use local relative paths
 * 3. Run Nest build
 * 4. Restore original import paths
 * 5. Clean up copied files
 *
 * This approach avoids:
 * - Publishing `@limitkit/http`
 * - Using a bundler (which can break Nest runtime behavior)
 *
 * While still allowing shared logic between adapters.
 */
async function main() {
  console.log("🔧 Copying HTTP source...");

  try {
    await copyHttp();

    console.log("✏️ Rewriting Nest imports...");
    await rewriteNestImports("@limitkit/http", "@limitkit/nest/http");

    console.log("🚀 Building...");
    await runBuild();

    console.log("🔄 Restoring imports...");
    await rewriteNestImports("@limitkit/nest/http", "@limitkit/http");

    console.log("✅ Done");
  } catch (err) {
    console.error("❌ Build failed:", err);
    process.exitCode = 1;
  } finally {
    console.log("🧹 Cleaning up...");
    await cleanup();
  }
}

main();
