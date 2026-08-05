export type ExpenseDoc = {
  id: string;
  date?: string;
  amount?: number;
  payerId?: string;
  participants?: string[];
  debts?: Record<string, number>;
  note?: string;
  createdBy?: string;
  [key: string]: unknown;
};

export type PaymentDoc = {
  id: string;
  date?: string;
  amount?: number;
  fromId?: string;
  toId?: string;
  note?: string;
  createdBy?: string;
  [key: string]: unknown;
};

export type RentDoc = {
  id?: string;
  period?: string;
  payerId?: string;
  items?: { rent?: number; wifi?: number; other?: number };
  total?: number;
  headcount?: number;
  shares?: Record<string, number>;
  paid?: Record<string, number>;
  note?: string;
  water?: { mode?: string; unitPrice?: number };
  electric?: { oldKwh?: number; newKwh?: number; unitPrice?: number };
  computed?: { waterCost?: number; kwhUsed?: number; electricCost?: number };
  splitMode?: string;
  [key: string]: unknown;
};

export type PeriodDoc = {
  id?: string;
  period?: string;
  lockedSoft?: boolean;
  lockedAt?: unknown;
  lockedBy?: string | null;
  closedAt?: unknown;
  closedBy?: string | null;
  closeSource?: string;
  snapshotType?: string;
  stats?: Record<string, number>;
  snapshot?: {
    balances?: Record<string, number>;
    settlementPlan?: Array<{ fromId: string; toId: string; amount: number }>;
    rent?: Record<string, unknown> | null;
    members?: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};

export type NotificationDoc = {
  id: string;
  uid?: string;
  memberId?: string;
  type?: string;
  period?: string;
  title?: string;
  body?: string;
  readAt?: unknown;
  createdAt?: { toMillis?: () => number };
  [key: string]: unknown;
};
