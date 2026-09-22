import fs from "node:fs";
import path from "node:path";
const secrets = fs.existsSync(".env")
  ? fs
      .readFileSync(".env", "utf8")
      .split("\n")
      .map((l) =>
        l
          .slice(l.indexOf("=") + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      )
      .filter((v) => v.length > 16)
  : [];
const files = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
}
walk("dist");
const exposed = files.filter((p) =>
  secrets.some((secret) => fs.readFileSync(p).includes(Buffer.from(secret))),
);
const envFiles = files.filter((p) => path.basename(p).startsWith(".env"));
const apiReferences = files.filter(
  (p) =>
    /\.(js|html)$/.test(p) &&
    /queue\.fal\.run|FAL_KEY|api\.meshy\.ai|api\.elevenlabs\.io|ELEVEN_LABS_KEY|ELEVENLABS_API_KEY/.test(
      fs.readFileSync(p, "utf8"),
    ),
);
const report = {
  filesScanned: files.length,
  credentialMatches: exposed,
  envFiles,
  generationApiReferences: apiReferences,
};
fs.writeFileSync("artifacts/security.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (exposed.length || envFiles.length || apiReferences.length)
  process.exitCode = 1;
