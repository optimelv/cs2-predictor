import { readFile, writeFile } from "node:fs/promises";
const entry = await readFile("docs/next/index.html", "utf8");
if (!entry.includes("/next/assets/"))
  throw new Error("React entry has no production assets");
await writeFile("docs/index.html", entry);
