import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";

const groupId = process.argv[2] || "P102";

function loadCredential() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    const json = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    return cert(json);
  }

  return applicationDefault();
}

initializeApp({
  credential: loadCredential(),
});

const db = getFirestore();

function sumValues(obj) {
  return Object.values(obj || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function validateRentDoc(doc) {
  const issues = [];
  const required = [
    "period",
    "payerId",
    "items",
    "total",
    "headcount",
    "water",
    "electric",
    "computed",
    "splitMode",
    "shares",
    "paid",
    "createdBy",
  ];

  for (const key of required) {
    if (!(key in doc)) issues.push(`missing field: ${key}`);
  }

  const shareSum = sumValues(doc.shares);
  const total = Number(doc.total || 0);
  if (shareSum !== total) {
    issues.push(`shares sum ${shareSum} != total ${total}`);
  }

  for (const [memberId, paid] of Object.entries(doc.paid || {})) {
    if (Number(paid || 0) > Number(doc.shares?.[memberId] || 0)) {
      issues.push(`paid exceeds share for ${memberId}`);
    }
  }

  return issues;
}

async function main() {
  const rents = await db.collection(`groups/${groupId}/rents`).get();
  let invalid = 0;

  for (const snap of rents.docs) {
    const issues = validateRentDoc(snap.data());
    if (!issues.length) continue;

    invalid += 1;
    console.log(`${snap.id}: ${issues.join("; ")}`);
  }

  if (!invalid) {
    console.log(`all rent docs look valid for group ${groupId}`);
  } else {
    console.log(`found ${invalid} invalid rent docs for group ${groupId}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
