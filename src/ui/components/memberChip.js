function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderMemberChip({
  memberId = "",
  label = "",
  size = "md",
  showName = true,
} = {}) {
  const displayLabel = label || memberId || "Thành viên";

  if (!showName) return "";

  return `
    <span class="member-chip member-chip--${size}">
      <span class="member-chip__name">${escapeHtml(displayLabel)}</span>
    </span>
  `;
}
