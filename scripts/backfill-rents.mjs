import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

function rentRef(period) {
  return db.doc(`groups/${groupId}/rents/${period}`);
}

function periodsCollection() {
  return db.collection(`groups/${groupId}/periods`);
}

function normalizeLegacyRent(period, data) {
  const rent = data?.rent;
  if (!rent || typeof rent !== "object") return null;

  return {
    ...rent,
    period: rent.period || period,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: rent.createdAt || FieldValue.serverTimestamp(),
  };
}

async function main() {
  const periods = await periodsCollection().get();
  let copied = 0;

  for (const snap of periods.docs) {
    const period = snap.id;
    const normalized = normalizeLegacyRent(period, snap.data());
    if (!normalized) continue;

    const existing = await rentRef(period).get();
    if (existing.exists) continue;

    await rentRef(period).set(normalized, { merge: true });
    copied += 1;
    console.log(`backfilled rent ${period}`);
  }

  console.log(`done: ${copied} rent docs copied for group ${groupId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
