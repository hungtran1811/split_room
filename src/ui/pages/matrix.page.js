import { renderPaymentsPage } from "./payments.page";

export async function renderMatrixPage() {
  await renderPaymentsPage({
    openVerification: true,
    aliasMode: true,
  });
}
