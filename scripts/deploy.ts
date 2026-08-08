import { execSync } from "node:child_process";
import { rpcUrl } from "./lib/config.js";

const so = process.argv[2] ?? "target/deploy/spin.so";
const progId = process.argv[3] ?? "target/deploy/spin-keypair.json";
const cmd = `solana program deploy --url ${rpcUrl()} --program-id ${progId} ${so}`;
console.log(`> ${cmd}`);
execSync(cmd, { stdio: "inherit", encoding: "utf8" });