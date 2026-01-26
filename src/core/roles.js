// src/core/roles.js
export const ADMIN_UID = "8tgX0c2IBbTx0k0oIZgn7w2H12b2";

export function isAdmin(user) {
  return !!user && user.uid === ADMIN_UID;
}
