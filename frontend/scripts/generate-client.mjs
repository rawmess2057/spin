// Generates a typed @solana/kit client for the spin program from its Anchor
// IDL. Run via `npm run codegen`. Output is checked into git — consumers
// don't need Rust/Anchor installed to build the frontend.
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";

const frontendDir = fileURLToPath(new URL("..", import.meta.url));
const idlPath = fileURLToPath(
  new URL("../../target/idl/spin.json", import.meta.url)
);
const outDir = `${frontendDir}/app/lib/solana`;

const idl = JSON.parse(readFileSync(idlPath, "utf8"));
const codama = createFromRoot(rootNodeFromAnchor(idl));

await codama.accept(
  renderVisitor(outDir, { generatedFolder: "generated/spin" })
);

// The renderer also writes a standalone package.json for the generated
// folder (as if it were its own npm package) — irrelevant here since the
// real dependencies already live in the frontend's own package.json.
rmSync(`${outDir}/package.json`, { force: true });

console.log(`Generated spin client at ${outDir}/generated/spin`);
