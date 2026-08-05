import { AppProviders } from "./AppProviders";
import { AppRouter } from "./router";

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
