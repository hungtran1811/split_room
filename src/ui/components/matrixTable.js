import { t, formatVND } from "../../config/i18n";

export function renderMatrixTable({
  members,
  matrix,
  title = t("rawDebtsMatrix"),
}) {
  const ids = members.map((m) => m.id);

  const header = `
    <thead>
      <tr>
        <th class="small text-secondary">${t("debtorCreditor")}</th>
        ${members.map((m) => `<th class="text-center">${escapeHtml(m.name || m.id)}</th>`).join("")}
      </tr>
    </thead>
  `;

  const body = `
    <tbody>
      ${members
        .map((rowM) => {
          const rowId = rowM.id;
          return `
          <tr>
            <th>${escapeHtml(rowM.name || rowId)}</th>
            ${ids
              .map((colId) => {
                const v = matrix?.[rowId]?.[colId] ?? 0;
                const isDiag = rowId === colId;
                const cls = isDiag
                  ? "bg-light"
                  : v > 0
                    ? "fw-semibold"
                    : "text-secondary";
                const text = isDiag ? "-" : formatVND(v);
                return `<td class="text-center ${cls}">${text}</td>`;
              })
              .join("")}
          </tr>
        `;
        })
        .join("")}
    </tbody>
  `;

  return `
    <div class="card">
      <div class="card-header small">${escapeHtml(title)}</div>
      <div class="table-responsive">
        <table class="table table-sm mb-0 align-middle">
          ${header}
          ${body}
        </table>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
