import { promises as fs } from "node:fs";
import path from "node:path";
import { transform } from "esbuild";

const projectRoot = "/home/ubuntu/isdb-bisew-frontend";
const sourceRoot = path.join(projectRoot, "client", "src");

async function collectSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolutePath);
    return /\.tsx?$/.test(entry.name) ? [absolutePath] : [];
  }));
  return nested.flat();
}

const sourceFiles = await collectSourceFiles(sourceRoot);
const emittedFiles = [];

for (const sourcePath of sourceFiles) {
  const extension = path.extname(sourcePath);
  const outputPath = sourcePath.slice(0, -extension.length) + (extension === ".tsx" ? ".jsx" : ".js");
  const source = await fs.readFile(sourcePath, "utf8");
  const { code } = await transform(source, {
    loader: extension === ".tsx" ? "tsx" : "ts",
    format: "esm",
    jsx: "preserve",
    target: "es2022",
    legalComments: "inline",
  });
  await fs.writeFile(outputPath, code, "utf8");
  emittedFiles.push({ sourcePath, outputPath });
}

await fs.writeFile(path.join(projectRoot, "scripts", "client-jsx-migration.json"), `${JSON.stringify(emittedFiles, null, 2)}\n`, "utf8");
console.log(`Converted ${emittedFiles.length} client files to JavaScript and JSX.`);
