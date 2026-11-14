/**
 * Development only: a fake backend answering the API inside the browser, so screens can be
 * viewed without Google sign-in or the Apps Script deployment. Used by preview.html, which is
 * not part of the production build. Figures come from the real money rules (lib/money.ts).
 */
import type { AppConfig, Report, Share, Transaction } from '../api/types.ts';
import { commissionPaise, fromPaise, splitPaise, toPaise } from '../lib/money.ts';

const partners = [
  { id: 'p1', name: 'Pankaj', defaultSharePct: 40, sortOrder: 0 },
  { id: 'p2', name: 'Ravi', defaultSharePct: 30, sortOrder: 1 },
  { id: 'p3', name: 'Sunita', defaultSharePct: 30, sortOrder: 2 }
];

const config: AppConfig = {
  defaultCommissionRatePct: 0.3,
  rateWarningAbovePct: 2,
  partners,
  partnerOrder: partners.map(p => p.id),
  today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
};

const customers = ['Ramesh Kumar', 'Suresh Traders', 'Anita Sharma', 'Mohan Lal & Sons', 'Kavita Jain', 'Deepak Gupta'];

function makeTxn(i: number, txnDate: string, amount: number, ratePct: number, repaid: boolean): Transaction {
  const commission = commissionPaise(toPaise(amount), ratePct);
  const earnings = splitPaise(commission, partners.map(p => p.defaultSharePct));
  const shares: Share[] = partners.map((p, k) => ({ partnerId: p.id, partnerName: p.name, sharePct: p.defaultSharePct, earning: fromPaise(earnings[k] ?? 0) }));
  const at = `${txnDate}T0${(i % 9) + 1}:15:00.000Z`;
  return {
    id: `t${i}`, createdAt: at, createdBy: 'ravi@gmail.com', updatedAt: at, updatedBy: 'ravi@gmail.com',
    deleted: false, deletedAt: '', deletedBy: '',
    txnDate, customerName: customers[i % customers.length] ?? 'Customer', amount, commissionRatePct: ratePct,
    commission: fromPaise(commission), repaidStatus: repaid ? 'REPAID' : 'PENDING',
    notes: i % 4 === 0 ? 'Returned within 2 hours' : null, shares
  };
}

/** About six months of entries ending today. */
const txns: Transaction[] = (() => {
  const out: Transaction[] = [];
  const end = Date.parse(config.today + 'T00:00:00Z');
  for (let i = 0; i < 70; i++) {
    const date = new Date(end - Math.floor(i * 2.6) * 864e5).toISOString().slice(0, 10);
    const amount = [500000, 250000, 125000.5, 800000, 300000, 75000][i % 6] ?? 100000;
    out.push(makeTxn(i, date, amount, i % 11 === 0 ? 0.275 : 0.3, i > 3));
  }
  return out;
})();

function inRange(t: Transaction, from: string, to: string) {
  return !t.deleted && t.txnDate >= from && t.txnDate <= to;
}

function report(from: string, to: string): Report {
  const list = txns.filter(t => inRange(t, from, to));
  const months: Report['byMonth'] = [];
  for (let d = new Date(from.slice(0, 7) + '-01T00:00:00Z'); d.toISOString().slice(0, 7) <= to.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const month = d.toISOString().slice(0, 7);
    const ms = list.filter(t => t.txnDate.startsWith(month));
    months.push({ month, lent: sum(ms.map(t => t.amount)), commission: sum(ms.map(t => t.commission)), count: ms.length });
  }
  const lent = sum(list.map(t => t.amount));
  const commission = sum(list.map(t => t.commission));
  const pending = list.filter(t => t.repaidStatus === 'PENDING');
  return {
    from, to,
    totals: {
      lent, commission, count: list.length,
      averageRatePct: lent ? Math.round((toPaise(commission) * 100 * 10000) / toPaise(lent)) / 10000 : null,
      pendingAmount: sum(pending.map(t => t.amount)), pendingCount: pending.length
    },
    byPartner: partners.map(p => ({
      partnerId: p.id, partnerName: p.name, active: true,
      earning: sum(list.flatMap(t => t.shares.filter(s => s.partnerId === p.id).map(s => s.earning)))
    })),
    byMonth: months
  };
}

const sum = (xs: number[]) => fromPaise(xs.reduce((a, x) => a + toPaise(x), 0));

type Payload = Record<string, unknown>;
const str = (p: Payload, k: string) => {
  const v = p[k];
  return typeof v === 'string' ? v : '';
};

function handle(action: string, p: Payload): unknown {
  switch (action) {
    case 'me': return { email: 'pankaj@gmail.com', name: 'Pankaj', role: 'ADMIN', isOwner: true };
    case 'getConfig': return config;
    case 'listTransactions': return txns.filter(t => inRange(t, str(p, 'from'), str(p, 'to'))).sort((a, b) => b.txnDate.localeCompare(a.txnDate));
    case 'getTransaction': return txns.find(t => t.id === str(p, 'id'));
    case 'report': return report(str(p, 'from'), str(p, 'to'));
    case 'setRepaid': {
      const t = txns.find(x => x.id === str(p, 'id'));
      if (t) t.repaidStatus = p.repaidStatus === 'REPAID' ? 'REPAID' : 'PENDING';
      return t;
    }
    case 'deleteTransaction': {
      const t = txns.find(x => x.id === str(p, 'id'));
      if (t) t.deleted = true;
      return { id: t?.id, deletedAt: new Date().toISOString(), deletedBy: 'pankaj@gmail.com' };
    }
    case 'restoreTransaction': {
      const t = txns.find(x => x.id === str(p, 'id'));
      if (t) t.deleted = false;
      return t;
    }
    case 'saveTransaction': {
      const input = p.transaction as { txnDate: string; amount: number; commissionRatePct: number; repaidStatus: string };
      const t = makeTxn(txns.length + 1, input.txnDate, input.amount, input.commissionRatePct, input.repaidStatus === 'REPAID');
      Object.assign(t, input, { id: typeof p.id === 'string' ? p.id : t.id });
      txns.unshift(t);
      return t;
    }
    default: throw new Error(`mock backend: ${action} not implemented`);
  }
}

/** Replaces window.fetch for API calls. */
export function installMockBackend(apiUrl: string): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== apiUrl) return realFetch(input, init);
    const raw = typeof init?.body === 'string' ? init.body : '{}';
    const body = JSON.parse(raw) as { action: string; payload: Payload };
    await new Promise(r => setTimeout(r, 150));   // feel of a real round trip
    try {
      return new Response(JSON.stringify({ ok: true, data: handle(body.action, body.payload) }));
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: { code: 'SERVER', message: (err as Error).message } }));
    }
  };
}
