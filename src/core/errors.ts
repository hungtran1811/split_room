export function mapFirestoreError(error: unknown, fallbackMessage?: string): string {
  const code = String((error as { code?: string })?.code || "");

  if (code.includes("permission-denied")) {
    return fallbackMessage || "Bạn không có quyền thực hiện thao tác này.";
  }

  if (code.includes("failed-precondition")) {
    return "Firestore đang thiếu index hoặc rules chưa khớp.";
  }

  if (code.includes("invalid-argument")) {
    return "Dữ liệu gửi lên không hợp lệ.";
  }

  if (code.includes("unavailable")) {
    return "Không thể kết nối tới Firestore. Hãy thử lại.";
  }

  return (
    fallbackMessage ||
    (error as { message?: string })?.message ||
    "Đã xảy ra lỗi không xác định."
  );
}

export function wrapFirestoreError(error: unknown, fallbackMessage?: string): Error {
  const wrapped = new Error(mapFirestoreError(error, fallbackMessage)) as Error & {
    code?: string;
    cause?: unknown;
  };
  wrapped.code = (error as { code?: string })?.code;
  wrapped.cause = error;
  return wrapped;
}
