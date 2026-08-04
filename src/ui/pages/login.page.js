import {
  getAuthErrorMessage,
  loginWithGoogle,
} from "../../services/auth.service";
import { renderAuthScreen } from "../components/authScreen";
import { unmountPrimaryNav } from "../layout/navbar";

function el(id) {
  return document.getElementById(id);
}

export function renderLoginPage({ initialMessage = "" } = {}) {
  const app = document.querySelector("#app");
  unmountPrimaryNav();

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
