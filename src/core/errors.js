export function mapFirestoreError(error, fallbackMessage) {
  const code = error?.code || "";

  if (code.includes("permission-denied")) {
    return "Bạn không có quyền thực hiện thao tác này.";
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

  return fallbackMessage || error?.message || "Đã xảy ra lỗi không xác định.";
}

export function wrapFirestoreError(error, fallbackMessage) {
  const wrapped = new Error(mapFirestoreError(error, fallbackMessage));
  wrapped.code = error?.code;
  wrapped.cause = error;
  return wrapped;
}
