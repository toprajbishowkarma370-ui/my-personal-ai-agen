"use client";

import { useEffect, useState, useCallback } from "react";

type Lead = { id: string; company: string; category: string; tier: number; score: number; status: string; notes?: string; customerId?: string | null; createdAt: string };
type Customer = { id: string; name: string; phone?: string | null; email?: string | null; location: string; createdAt: string };
type Task = { id: string; title: string; description?: string | null; status: string; priority: string; leadId?: string | null; createdAt: string };
type Invoice = { id: string; invoiceNumber: string; title: string; total: number; status: string; currency: string; customer?: { name: string } | null; createdAt: string };
type Proposal = { id: string; title: string; value?: number | null; status: string; createdAt: string };

const STATUS_BADGE: Record<string, string> = {
  WAITING_APPROVAL: "bg-amber-500 text-slate-900 font-bold text-xs",
  AUTHORIZED: "bg-blue-600 text-white text-xs",
  CONTACTED: "bg-blue-500 text-white text-xs",
  INTERESTED: "bg-emerald-500 text-white text-xs",
  CONVERTED: "bg-purple-600 text-white text-xs",
  CLOSED: "bg-slate-500 text-white text-xs",
  DRAFT: "bg-slate-700 text-slate-300 text-xs",
  ISSUED: "bg-blue-600 text-white text-xs",
  PARTIALLY_PAID: "bg-amber-500 text-slate-900 text-xs",
  PAID: "bg-emerald-600 text-white text-xs",
  PENDING: "bg-slate-700 text-slate-300 text-xs",
  VERIFIED: "bg-emerald-600 text-white text-xs",
  FAILED: "bg-rose-600 text-white text-xs",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<{ leads: number; customers: number; tasks: number; invoices: number; proposals: number }>({ leads: 0, customers: 0, tasks: 0, invoices: 0, proposals: 0 });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: "", type: "info" as "info" | "success" | "error" });

  const fetchData = useCallback(async () => {
    try {
      const res = await Promise.all([
        fetch("/api/leads", { credentials: "include" }),
        fetch("/api/customers", { credentials: "include" }),
        fetch("/api/tasks", { credentials: "include" }),
        fetch("/api/invoices", { credentials: "include" }),
        fetch("/api/proposals", { credentials: "include" }),
      ]);
      const [leadsRes, customersRes, tasksRes, invoicesRes, proposalsRes] = res;
      const leadsData = await leadsRes.json();
      const customersData = await customersRes.json();
      const tasksData = await tasksRes.json();
      const invoicesData = await invoicesRes.json();
      const proposalsData = await proposalsRes.json();

      setLeads(leadsData.success ? leadsData.leads : []);
      setCustomers(customersData.success ? customersData.customers : []);
      setTasks(tasksData.success ? tasksData.tasks : []);
      setInvoices(invoicesData.success ? invoicesData.invoices : []);
      setProposals(proposalsData.success ? proposalsData.proposals : []);
      setStats({
        leads: leadsData.success ? leadsData.count : 0,
        customers: customersData.success ? customersData.count : 0,
        tasks: tasksData.success ? tasksData.count : 0,
        invoices: invoicesData.success ? invoicesData.count : 0,
        proposals: proposalsData.success ? proposalsData.count : 0,
      });
    } catch (e: any) {
      setMessage({ text: "Failed to load dashboard data: " + e.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showMessage = (text: string, type: "info" | "success" | "error" = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "info" }), 5000);
  };

  const postJson = async (path: string, body: any) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const handleAddLead = async () => {
    const company = prompt("Enter the prospect company name:");
    if (!company) return;
    try {
      const data = await postJson("/api/leads", { company, status: "WAITING_APPROVAL", score: 80, category: "General" });
      if (data.success) {
        showMessage(`Lead "${data.lead.company}" added.`);
        fetchData();
      } else {
        showMessage(data.error || "Add lead failed", "error");
      }
    } catch (e: any) { showMessage(e.message, "error"); }
  };

  const handleCreateInvoice = async () => {
    const customerName = prompt("Invoice customer name:");
    if (!customerName) return;
    const amount = prompt("Amount (NPR):");
    if (!amount) return;
    try {
      const custData = await postJson("/api/customers", { name: customerName, location: "Chaurjahari, Karnali" });
      const customerId = custData.success ? custData.customer.id : null;
      const data = await postJson("/api/invoices", {
        customerId,
        title: `Invoice for ${customerName}`,
        items: JSON.stringify([{ name: "Service", qty: 1, price: Number(amount) }]),
        subtotal: Number(amount),
        tax: 0,
        total: Number(amount),
        currency: "NPR",
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: "ISSUED",
      });
      if (data.success) {
        showMessage(`Invoice ${data.invoice.invoiceNumber} issued (${data.invoice.status}).`);
        fetchData();
      } else {
        showMessage(data.error || "Create invoice failed", "error");
      }
    } catch (e: any) { showMessage(e.message, "error"); }
  };

  const handleCreateProposal = async () => {
    const title = prompt("Proposal title:");
    if (!title) return;
    const value = prompt("Proposed value (NPR):");
    try {
      const data = await postJson("/api/proposals", { title, content: "Professional business proposal prepared for the customer. Owner approval required before delivery.", value: value !== undefined ? Number(value) : null, status: "DRAFT" });
      if (data.success) {
        showMessage(`Proposal "${data.proposal.title}" drafted.`);
        fetchData();
      } else {
        showMessage(data.error || "Create proposal failed", "error");
      }
    } catch (e: any) { showMessage(e.message, "error"); }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-slate-400 font-mono text-sm">Loading Business Dashboard…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Owner Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Sales workflow: Lead → Contact → Interested → Proposal → Approval → Payment → Project → Delivery → Follow-up.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAddLead} className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition shadow">+ Add Lead</button>
          <button onClick={handleCreateInvoice} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition shadow">+ Issue Invoice</button>
          <button onClick={handleCreateProposal} className="bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2.5 rounded-xl text-sm font-bold transition shadow">+ Draft Proposal</button>
          <a href="/dashboard/websites" className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-600 transition">Website Builder</a>
        </div>
      </div>

      {message.text && (
        <div className={`p-3 rounded-xl text-sm font-mono border ${message.type === "success" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : message.type === "error" ? "bg-rose-500/10 border-rose-500/40 text-rose-300" : "bg-slate-800 border-slate-700 text-slate-300"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Leads", value: stats.leads, color: "text-brand-400" },
          { label: "Customers", value: stats.customers, color: "text-emerald-400" },
          { label: "Tasks", value: stats.tasks, color: "text-blue-400" },
          { label: "Invoices", value: stats.invoices, color: "text-purple-400" },
          { label: "Proposals", value: stats.proposals, color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="bg-[#0b0f1f] border border-slate-800 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{s.label}</div>
            <div className="text-2xl font-black mt-1 {s.color}">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-[#0b0f1f] border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">Lead Pipeline</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 uppercase">
                    <th className="p-2">Company</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Score</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Customer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {leads.length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-center text-slate-500">No leads yet. Add a prospect to begin the sales workflow.</td></tr>
                  ) : (
                    leads.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-900/30">
                        <td className="p-2 font-mono">{l.company}</td>
                        <td className="p-2 text-xs text-slate-400">{l.category}</td>
                        <td className="p-2">{l.score}</td>
                        <td className="p-2"><span className={`inline-flex px-2 py-0.5 rounded-full ${STATUS_BADGE[l.status] || "bg-slate-700 text-slate-300"}`}>{l.status}</span></td>
                        <td className="p-2 text-xs text-slate-400">{l.customerId ? "linked" : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-[#0b0f1f] border border-slate-800 rounded-xl p-4 mb-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">Recent Invoices</h2>
            <div className="space-y-2">
              {invoices.slice(0, 5).length === 0 ? (
                <div className="text-xs text-slate-500">No invoices yet.</div>
              ) : (
                invoices.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="text-xs border-b border-slate-800 pb-1">
                    <div className="flex justify-between text-slate-200">{inv.invoiceNumber} <span className={`font-mono ${STATUS_BADGE[inv.status]}`}>{inv.status}</span></div>
                    <div className="text-slate-500">{inv.customer?.name || "—"} • {inv.currency} {inv.total}</div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="bg-[#0b0f1f] border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">Recent Tasks</h2>
            <div className="space-y-2">
              {tasks.slice(0, 5).length === 0 ? (
                <div className="text-xs text-slate-500">No tasks yet.</div>
              ) : (
                tasks.slice(0, 5).map((t) => (
                  <div key={t.id} className="text-xs border-b border-slate-800 pb-1">
                    <div className="text-slate-200">{t.title}</div>
                    <div className="text-slate-500">{t.status} • {t.priority}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#0b0f1f] border border-slate-800 rounded-xl p-4 mt-4">
        <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">Proposals Awaiting Owner Approval</h2>
        <div className="space-y-2">
          {proposals.filter((p) => p.status === "DRAFT").length === 0 ? (
            <div className="text-xs text-slate-500">No draft proposals.</div>
          ) : (
            proposals.filter((p) => p.status === "DRAFT").map((p) => (
              <div key={p.id} className="text-xs border-b border-slate-800 pb-1">
                <div className="flex justify-between text-slate-200">{p.title} <span className="font-mono text-amber-400">DRAFT</span></div>
                <div className="text-slate-500">Value: {p.value !== null ? "NPR " + p.value : "—"}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
