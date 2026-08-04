import { logout } from "../../../services/auth.service";
import {
  getSelectedPeriod,
  state,
  subscribeSelectedPeriod,
} from "../../../core/state";
import { getCurrentUserLabel } from "../../../core/display-name";
import { watchRentByPeriod } from "../../../services/rent.service";
import { mountAuthenticatedPage } from "../../layout/page-mount";
import { getAppRoot } from "../../layout/shell-controller";
import { createRentFormController, emptyRentDoc } from "./form";
import { renderRentPageContent } from "./render";

let unsubscribeRent = null;

export async function renderRentPage() {
  if (!state.user || !state.groupId) return;

  const groupId = state.groupId;
  const payerId = "hung";
  const canEdit = state.canOperateMonth;
  const initialPeriod = getSelectedPeriod();
  let period = initialPeriod;
  let liveDoc = null;
  let prefilledPeriod = null;

  mountAuthenticatedPage({
    pageId: "rent",
    title: "",
    meta: [],
    period: initialPeriod,
    content: renderRentPageContent(payerId),
    nav: {
      active: "rent",
      isOwner: state.isOwner,
      includeLogout: true,
      onLogout: async () => logout(),
      userLabel: getCurrentUserLabel(state),
    },
  });

  const page = getAppRoot();
  const form = createRentFormController({
    page,
    groupId,
    payerId,
    canEdit,
    getPeriod: () => period,
    getLiveDoc: () => liveDoc,
    getPrefilledPeriod: () => prefilledPeriod,
    setPrefilledPeriod: (nextPeriod) => {
      prefilledPeriod = nextPeriod;
    },
  });

  function startWatch() {
    unsubscribeRent?.();
    unsubscribeRent = watchRentByPeriod(groupId, period, (docData) => {
      liveDoc = docData;
      if (!document.body.contains(page)) return;

      if (!docData) {
        if (form.isPrefilled(period)) return;
        form.prefillIfMissing(period).then((applied) => {
          if (!applied) form.hydrateUI(emptyRentDoc(period, payerId));
        });
        return;
      }

      form.hydrateUI(docData);
    });
  }

  form.bindActions();
  startWatch();

  const unsubscribeSelectedPeriod = subscribeSelectedPeriod((nextPeriod) => {
    if (nextPeriod === period) return;
    period = nextPeriod;
    prefilledPeriod = null;
    startWatch();
  });

  const onHashChange = () => {
    if (!location.hash.startsWith("#/rent")) {
      unsubscribeRent?.();
      unsubscribeRent = null;
      unsubscribeSelectedPeriod();
      window.removeEventListener("hashchange", onHashChange);
    }
  };

  window.addEventListener("hashchange", onHashChange);
}
