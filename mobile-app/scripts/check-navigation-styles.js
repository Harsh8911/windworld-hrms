const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoots = [path.join(projectRoot, "App.tsx"), path.join(projectRoot, "src")];
const sourceExtensions = new Set([".ts", ".tsx"]);
const unsafeUtilities = [
  { name: "shadow utility", expression: /(?:^|\s)(?:[a-z]+:)*shadow(?:-[^\s"'`}]+)?(?=\s|["'`}])/ },
  { name: "opacity utility", expression: /(?:^|\s)(?:[a-z]+:)*opacity-\d+(?=\s|["'`}])/ },
  { name: "color opacity shorthand", expression: /\b(?:bg|text|border|shadow)-[^\s"'`}]+\/\d+\b/ },
  { name: "animation utility", expression: /(?:^|\s)(?:[a-z]+:)*animate-[^\s"'`}]+/ },
];

function collectFiles(target) {
  const stat = fs.statSync(target);

  if (stat.isFile()) return sourceExtensions.has(path.extname(target)) ? [target] : [];

  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) =>
    collectFiles(path.join(target, entry.name)),
  );
}

const violations = sourceRoots.flatMap(collectFiles).flatMap((file) =>
  fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .flatMap((line, index) =>
      unsafeUtilities
        .filter(({ expression }) => expression.test(line))
        .map(({ name }) => `${path.relative(projectRoot, file)}:${index + 1} uses an unsafe ${name}`),
    ),
);

if (violations.length > 0) {
  console.error(violations.join("\n"));
  console.error("Use stable colors or inline React Native styles for these properties.");
  process.exit(1);
}

console.log("Navigation-sensitive NativeWind utility check passed.");
