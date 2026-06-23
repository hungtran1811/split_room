import * as bootstrap from "bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";

window.bootstrap = bootstrap;
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/auth.css";
import "./styles/shell.css";
import "./styles/dashboard.css";
import "./styles/payments.css";
import "./styles/reports.css";
import "./styles/components.css";
import "./styles/expenses.css";
import { startApp } from "./app";

startApp();
