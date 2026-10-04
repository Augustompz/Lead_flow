import { GOOGLE_FREE_REQUESTS } from "./constants";
import { rows } from "./db";
import { lastMonths, monthLabel, todayBR } from "./format";

export type Sale = {
  id: number;
  lead_id: number | null;
  client_name: string;
  service: string;
  amount: number;
  sold_at: string;
  notes: string | null;
};
export type Subscription = {
  id: number;
  lead_id: number | null;
  client_name: string;
  plan: string;
  amount: number;
  start_date: string;
  end_date: string | null;
};
export type Cost = {
  id: number;
  description: string;
  category: string;
  amount: number;
  kind: "unico" | "mensal";
  start_date: string;
  end_date: string | null;
};

export type MonthRow = {
  key: string;
  label: string;
  salesRevenue: number;
  recurringRevenue: number;
  revenue: number;
  costsManual: number;
  costsApi: number;
  costs: number;
  profit: number;
  salesCount: number;
};

/** Item mensal está ativo no mês "YYYY-MM"? */
function activeInMonth(start: string, end: string | null, key: string): boolean {
  const startKey = start.slice(0, 7);
  const endKey = end ? end.slice(0, 7) : null;
  return startKey <= key && (endKey === null || endKey >= key);
}

export type PeriodTotals = {
  revenue: number;
  costs: number;
  profit: number;
  margin: number | null;
  salesCount: number;
  avgTicket: number;
  costPerClient: number | null;
};

export type Totals = PeriodTotals & {
  months: MonthRow[];
  mrr: number;
  activeClients: number;
};

export function periodTotals(months: MonthRow[]): PeriodTotals {
  const revenue = months.reduce((a, m) => a + m.revenue, 0);
  const costs = months.reduce((a, m) => a + m.costs, 0);
  const salesCount = months.reduce((a, m) => a + m.salesCount, 0);
  const salesRevenue = months.reduce((a, m) => a + m.salesRevenue, 0);
  return {
    revenue,
    costs,
    profit: revenue - costs,
    margin: revenue > 0 ? (revenue - costs) / revenue : null,
    salesCount,
    avgTicket: salesCount ? Math.round(salesRevenue / salesCount) : 0,
    costPerClient: salesCount ? Math.round(costs / salesCount) : null,
  };
}

export async function financeSummary(nMonths: number): Promise<Totals> {
  const today = todayBR();
  const keys = lastMonths(nMonths, today);
  const [sales, subs, costs, searches, apiRow] = await Promise.all([
    rows<Sale>("SELECT * FROM sales"),
    rows<Subscription>("SELECT * FROM subscriptions"),
    rows<Cost>("SELECT * FROM costs"),
    rows<{ month: string; requests: number }>("SELECT month, used AS requests FROM api_usage"),
    rows<{ value: string }>("SELECT value FROM settings WHERE key = 'custo_requisicao'"),
  ]);
  const apiCostPerRequest = Number(apiRow[0]?.value ?? 20) || 0;
  const requestsByMonth = new Map(searches.map((s) => [s.month, Number(s.requests)]));

  const months: MonthRow[] = keys.map((key) => {
    const monthSales = sales.filter((s) => s.sold_at.slice(0, 7) === key);
    const salesRevenue = monthSales.reduce((a, s) => a + s.amount, 0);
    const recurringRevenue = subs
      .filter((s) => activeInMonth(s.start_date, s.end_date, key))
      .reduce((a, s) => a + s.amount, 0);
    const costsManual = costs
      .filter((c) =>
        c.kind === "mensal" ? activeInMonth(c.start_date, c.end_date, key) : c.start_date.slice(0, 7) === key,
      )
      .reduce((a, c) => a + c.amount, 0);
    // Só entra como custo o que passa da franquia grátis do mês.
    const paidRequests = Math.max(0, (requestsByMonth.get(key) ?? 0) - GOOGLE_FREE_REQUESTS);
    const costsApi = Math.round(paidRequests * apiCostPerRequest);
    const revenue = salesRevenue + recurringRevenue;
    const total = costsManual + costsApi;
    return {
      key,
      label: monthLabel(key),
      salesRevenue,
      recurringRevenue,
      revenue,
      costsManual,
      costsApi,
      costs: total,
      profit: revenue - total,
      salesCount: monthSales.length,
    };
  });

  const currentKey = today.slice(0, 7);
  const activeSubs = subs.filter((s) => activeInMonth(s.start_date, s.end_date, currentKey) && (!s.end_date || s.end_date > today));

  return {
    months,
    ...periodTotals(months),
    mrr: activeSubs.reduce((a, s) => a + s.amount, 0),
    activeClients: new Set(activeSubs.map((s) => s.client_name.toLowerCase())).size,
  };
}
