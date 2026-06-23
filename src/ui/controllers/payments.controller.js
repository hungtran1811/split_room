import { nameOf } from "../../config/roster";
import { parseVndInput } from "../../core/money";
import { mapFirestoreError } from "../../core/errors";
import { state } from "../../core/state";
import {
  addPayment,
  removePayment,
  updatePayment,
} from "../../services/payment.service";
import { openConfirmModal } from "../components/confirmModal";
import { openPaymentEditModal } from "../components/paymentEditModal";
import { openPaymentModal } from "../components/paymentModal";
import { showToast } from "../components/toast";
import { bindCopyButtons } from "../utils/copyAmount";
import { copySettlementReminder } from "../utils/settlement-message";
import {
  defaultPaymentDateForPeriod,
  formatPaymentVND,
  parseSettlementAction,
  paymentDateBoundsForPeriod,
  paymentDateHelpForPeriod,
} from "../views/payments.view";

export function bindPaymentsActions({
  root,
  groupId,
  period,
  canOperate,
  monthPayments = [],
  settlementPlan = [],
} = {}) {
  if (!root) return;

  bindSettlementButtons({ root, groupId, period, canOperate });
  bindHistoryActions({ root, groupId, canOperate, monthPayments });
  root.querySelector("#btnCopyAllSettlement")?.addEventListener("click", async () => {
    await copySettlementReminder(period, settlementPlan);
    showToast({
      title: "Đã copy",
      message: "Nội dung nhắc nợ đã được copy.",
      variant: "success",
    });
  });
  bindCopyButtons(root, {
    getLabel: (fromId, toId) => ({
      fromName: nameOf(fromId),
      toName: nameOf(toId),
    }),
  });
}

function openSettlementPaymentModal({
  actionValue,
  viewingPeriod,
  groupId,
  lockAmount = false,
  title,
  defaultNote,
}) {
  const { fromId, toId, amount, debtPeriod } = parseSettlementAction(
    actionValue,
    viewingPeriod,
  );
  const { minDate, maxDate } = paymentDateBoundsForPeriod(debtPeriod);
  const defaultDate = defaultPaymentDateForPeriod(debtPeriod);

  openPaymentModal({
    fromName: nameOf(fromId),
    toName: nameOf(toId),
    amount,
    lockAmount,
    maxAmount: lockAmount ? null : amount,
    defaultNote,
    defaultDate,
    minDate,
    maxDate,
    dateHelp: paymentDateHelpForPeriod(debtPeriod),
    parseVndInput,
    title,
    onSubmit: async ({ amount: paidAmount, note, date }) => {
      try {
        await addPayment(groupId, {
          fromId,
          toId,
          amount: paidAmount,
          date,
          note,
          createdBy: state.user.uid,
        });
        showToast({
          title: "Thành công",
          message: "Đã ghi nhận thanh toán.",
          variant: "success",
        });
      } catch (error) {
        throw new Error(
          mapFirestoreError(error, "Không thể ghi nhận thanh toán."),
        );
      }
    },
  });
}

function bindSettlementButtons({ root, groupId, period, canOperate }) {
  if (!canOperate) return;

  root.querySelectorAll("[data-pay-full]").forEach((button) => {
    button.addEventListener("click", () => {
      openSettlementPaymentModal({
        actionValue: button.getAttribute("data-pay-full"),
        viewingPeriod: period,
        groupId,
        lockAmount: true,
        title: "Ghi nhận trả đủ",
        defaultNote: "Trả đủ theo cấn trừ",
      });
    });
  });

  root.querySelectorAll("[data-pay-part]").forEach((button) => {
    button.addEventListener("click", () => {
      openSettlementPaymentModal({
        actionValue: button.getAttribute("data-pay-part"),
        viewingPeriod: period,
        groupId,
        lockAmount: false,
        title: "Ghi nhận trả một phần",
        defaultNote: "Trả một phần theo cấn trừ",
      });
    });
  });
}

function bindHistoryActions({ root, groupId, canOperate, monthPayments }) {
  if (!canOperate) return;

  root.querySelectorAll("[data-edit-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      const payment = monthPayments.find(
        (item) => item.id === button.getAttribute("data-edit-payment"),
      );
      if (!payment) return;

      openPaymentEditModal({
        date: payment.date || "",
        note: payment.note || "",
        onSubmit: async ({ date, note }) => {
          try {
            await updatePayment(groupId, payment.id, { date, note });
            showToast({
              title: "Thành công",
              message: "Đã cập nhật ngày và ghi chú thanh toán.",
              variant: "success",
            });
          } catch (error) {
            throw new Error(
              mapFirestoreError(error, "Không thể cập nhật thanh toán."),
            );
          }
        },
      });
    });
  });

  root.querySelectorAll("[data-delete-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      const payment = monthPayments.find(
        (item) => item.id === button.getAttribute("data-delete-payment"),
      );
      if (!payment) return;

      openConfirmModal({
        title: "Xóa thanh toán",
        message: "Bạn chắc chắn muốn xóa thanh toán này?",
        meta: `${payment.date} • ${nameOf(payment.fromId)} -> ${nameOf(payment.toId)} • ${formatPaymentVND(payment.amount)}`,
        onConfirm: async () => {
          await removePayment(groupId, payment.id);
          showToast({
            title: "Đã xóa",
            message: "Thanh toán đã được xóa khỏi tháng đang xem.",
            variant: "success",
          });
        },
      });
    });
  });
}
