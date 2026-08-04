import {
  getAuthErrorMessage,
  loginWithGoogle,
} from "../../services/auth.service";
import { firebaseConfigured } from "../../config/firebase";
import { renderAuthScreen } from "../components/authScreen";
import { unmountPrimaryNav } from "../layout/navbar";

function el(id) {
  return document.getElementById(id);
}

export function renderLoginPage({ initialMessage = "" } = {}) {
  const app = document.querySelector("#app");
  unmountPrimaryNav();

  if (!firebaseConfigured) {
    app.innerHTML = renderAuthScreen({
      variant: "boot",
      bootTitle: "Chưa cấu hình Firebase",
      bootSubtitle:
        "Thiếu VITE_FB_API_KEY hoặc VITE_FB_PROJECT_ID. Sao chép .env.example thành .env.local, điền cấu hình Firebase, rồi chạy lại ứng dụng.",
    });
    return;
  }

  app.innerHTML = renderAuthScreen({ variant: "login" });

  const msg = (text = "") => {
    const node = el("msg");
    if (node) node.textContent = text;
  };

  msg(initialMessage);

  el("btnGoogle").onclick = async () => {
    const button = el("btnGoogle");
    msg("");
    button.disabled = true;

    try {
      await loginWithGoogle();
    } catch (error) {
      msg(getAuthErrorMessage(error));
      button.disabled = false;
    }
  };
}
