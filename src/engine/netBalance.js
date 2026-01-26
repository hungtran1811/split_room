/**
 * balance[id] = incoming - outgoing
 * incoming: others owe me  (matrix[other][me])
 * outgoing: I owe others   (matrix[me][other])
 */
export function computeNetBalances(memberIds, grossMatrix) {
  const balance = {};
  for (const id of memberIds) balance[id] = 0;

  for (const debtor of memberIds) {
    for (const creditor of memberIds) {
      const amt = grossMatrix?.[debtor]?.[creditor] || 0;
      if (!amt) continue;

      balance[debtor] -= amt; // debtor owes -> negative
      balance[creditor] += amt; // creditor receives -> positive
    }
  }

  // round to 2 decimals
  for (const id of memberIds) balance[id] = round2(balance[id]);

  return balance;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
