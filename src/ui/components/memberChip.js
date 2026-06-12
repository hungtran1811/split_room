const MEMBER_COLORS = {
  hung: "#1d4ed8",
  thao: "#b45309",
  thinh: "#15803d",
  thuy: "#7c3aed",
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initialsFromLabel(label, memberId) {
  const text = String(label || memberId || "?").trim();
  if (!text) return "?";
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
  }
  return text.slice(0, 1).toUpperCase();
}

export function renderMemberChip({
  memberId = "",
  label = "",
  photoURL = "",
  size = "md",
  showName = true,
} = {}) {
  const displayLabel = label || memberId || "Thành viên";
  const color = MEMBER_COLORS[memberId] || "#64748b";
  const initials = initialsFromLabel(displayLabel, memberId);
  const avatar = photoURL
    ? `<img class="member-chip__avatar" src="${escapeHtml(photoURL)}" alt="" loading="lazy" />`
    : `<span class="member-chip__avatar member-chip__avatar--fallback" style="--member-color:${color}">${escapeHtml(initials)}</span>`;

  return `
    <span class="member-chip member-chip--${size}">
      ${avatar}
      ${showName ? `<span class="member-chip__name">${escapeHtml(displayLabel)}</span>` : ""}
    </span>
  `;
}

export function getMemberPhotoUrl(memberId, members = []) {
  const member = (members || []).find(
    (item) => item.memberId === memberId || item.id === memberId,
  );
  return member?.photoURL || "";
}
