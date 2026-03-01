import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";

const FIREBASE_PROJECT_ID = "demo-split-room-test";
const FIREBASE_CLI = path.resolve(
  "node_modules",
  "firebase-tools",
  "lib",
  "bin",
  "firebase.js",
);
const VITEST_CLI = path.resolve("node_modules", "vitest", "vitest.mjs");

function pathExists(candidate) {
  return candidate && existsSync(candidate);
}

function findJavaFromWhere() {
  const result = spawnSync("where.exe", ["java"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) return null;

  const candidate = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return candidate && pathExists(candidate) ? candidate : null;
}

function findJavaFromKnownRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, "AppData", "Local", "Programs", "Microsoft"),
    path.join(home, "AppData", "Local", "Programs"),
    "C:\\Program Files\\Microsoft",
    "C:\\Program Files\\Java",
    "C:\\Program Files\\Eclipse Adoptium",
  ];

  for (const root of roots) {
    if (!pathExists(root)) continue;

    const directCandidates = [
      path.join(root, "jdk-17.0.10.7-hotspot", "bin", "java.exe"),
      path.join(root, "jdk-17", "bin", "java.exe"),
      path.join(root, "jdk-17.0.10", "bin", "java.exe"),
    ];

    const directMatch = directCandidates.find(pathExists);
    if (directMatch) return directMatch;

    let entries = [];
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const lowerName = entry.name.toLowerCase();
      if (!lowerName.includes("jdk") && !lowerName.includes("openjdk")) {
        continue;
      }

      const candidate = path.join(root, entry.name, "bin", "java.exe");
      if (pathExists(candidate)) return candidate;
    }
  }

  return null;
}

function resolveJavaExecutable() {
  const javaHome = process.env.JAVA_HOME;
  const fromJavaHome = javaHome
    ? path.join(javaHome, "bin", "java.exe")
    : null;

  return (
    (fromJavaHome && pathExists(fromJavaHome) && fromJavaHome) ||
    findJavaFromWhere() ||
    findJavaFromKnownRoots()
  );
}

function quoteForShell(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function buildFirebaseArgs(mode) {
  if (mode === "start") {
    return [
      "emulators:start",
      "--project",
      FIREBASE_PROJECT_ID,
      "--only",
      "firestore",
    ];
  }

  const vitestCommand = [
    quoteForShell(process.execPath),
    quoteForShell(VITEST_CLI),
    "run",
    "tests/firestore.rules.test.js",
  ].join(" ");

  return [
    "emulators:exec",
    "--project",
    FIREBASE_PROJECT_ID,
    "--only",
    "firestore",
    vitestCommand,
  ];
}

async function main() {
  const mode = process.argv[2] || "exec";
  const javaExecutable = resolveJavaExecutable();

  if (!javaExecutable) {
    console.error(
      "Không tìm thấy Java. Hãy cài JDK 17 hoặc đặt JAVA_HOME trước khi chạy emulator.",
    );
    process.exitCode = 1;
    return;
  }

  if (!pathExists(FIREBASE_CLI)) {
    console.error("Không tìm thấy local firebase-tools trong node_modules.");
    process.exitCode = 1;
    return;
  }

  if (mode === "exec" && !pathExists(VITEST_CLI)) {
    console.error("Không tìm thấy Vitest CLI trong node_modules.");
    process.exitCode = 1;
    return;
  }

  const javaBinDir = path.dirname(javaExecutable);
  const javaHome = path.dirname(javaBinDir);
  const env = {
    ...process.env,
    JAVA_HOME: process.env.JAVA_HOME || javaHome,
    PATH: [javaBinDir, process.env.PATH || ""].filter(Boolean).join(path.delimiter),
  };

  const args = buildFirebaseArgs(mode);
  const child = spawn(process.execPath, [FIREBASE_CLI, ...args], {
    env,
    stdio: "inherit",
    shell: false,
  });

  await new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      process.exitCode = code ?? 0;
      resolve();
    });
    child.on("error", reject);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
