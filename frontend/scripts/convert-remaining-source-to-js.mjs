import { promises as fs } from "node:fs";
import path from "node:path";
import { transform } from "esbuild";

const projectRoot = "/home/ubuntu/isdb-bisew-frontend";
const sourceFiles = [
  path.join(projectRoot, "server", "index.ts"),
  path.join(projectRoot, "shared", "const.ts"),
  path.join(projectRoot, "vite.config.ts"),
];

for (const sourcePath of sourceFiles) {
  const source = await fs.readFile(sourcePath, "utf8");
  const { code } = await transform(source, { loader: "ts", format: "esm", target: "es2022", legalComments: "inline" });
  await fs.writeFile(sourcePath.replace(/\.ts$/, ".js"), code, "utf8");
}

console.log(`Converted ${sourceFiles.length} remaining TypeScript source files to JavaScript.`);
