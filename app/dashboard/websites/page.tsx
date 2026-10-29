"use client";

import { useState, useEffect, useCallback } from "react";

type Template = {
  id: string;
  name: string;
  category: string;
  description: string;
  layout: string;
};

type Website = {
  id: string;
  name: string;
  slug: string;
  template: string;
  status: string;
  isArchived: boolean;
  ownerApproved: boolean;
  ownerApprovedAt?: string | null;
  ownerApprovedBy?: string | null;
  previewUrl?: string | null;
  publishUrl?: string | null;
  data?: string | null;
  content?: string | null;
  theme?: string | null;
  settings?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  createdAt: string;
  updatedAt: string;
};

const TEMPLATE_LABELS: Record<string, string> = {
  "local-business": "Local Business",
  "hotel-restaurant": "Hotel and Restaurant",
  "school-college": "School and College",
  "clinic-healthcare": "Clinic and Healthcare",
  "agrovet-agriculture": "Agrovet and Agriculture",
  "real-estate": "Real Estate",
  "portfolio-personal": "Portfolio and Personal Brand",
  "agency-services": "Agency and Services",
  "ecommerce-store": "E-commerce Store",
  "startup-saas": "Startup and SaaS",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-700 text-slate-300",
  EDITING: "bg-blue-600 text-white",
  PENDING_OWNER_APPROVAL: "bg-amber-500 text-slate-900 font-bold",
  APPROVED: "bg-emerald-600 text-white",
  PUBLISHED: "bg-purple-600 text-white",
  ARCHIVED: "bg-slate-900 text-slate-500",
};

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<"list" | "create" | "edit">("list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [website, setWebsite] = useState<Website | null>(null);
  const [message, setMessage] = useState({ text: "", type: "info" as "info" | "success" | "error" });

  const fetchData = useCallback(async () => {
    try {
      const [wRes, tRes] = await Promise.all([
        fetch("/api/websites", { credentials: "include" }),
        fetch("/api/websites/templates", { credentials: "include" }),
      ]);
      const wData = await wRes.json();
      const tData = await tRes.json();
      setWebsites(wData.success ? wData.websites : []);
      setTemplates(tData.success ? tData.templates : []);
    } catch (e: any) {
      setMessage({ text: "Failed to load websites: " + e.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showMessage = (text: string, type: "info" | "success" | "error" = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "info" }), 5000);
  };

  const handleCreate = () => {
    setWebsite(null);
    setFormMode("create");
  };

  const handleEdit = (id: string) => {
    const w = websites.find((x) => x.id === id);
    setWebsite(w || null);
    setActiveId(id);
    setFormMode("edit");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const name = formData.get("name") as string;
    const templateId = formData.get("templateId") as string;
    const customerId = formData.get("customerId") as string || undefined;
    const leadId = formData.get("leadId") as string || undefined;

    if (!name || !templateId) {
      showMessage("Name and template are required", "error");
      return;
    }

    if (formMode === "create") {
      const res = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, templateId, customerId, leadId }),
      });
      const data = await res.json();
      if (data.success) {
        showMessage(`Website "${data.website.name}" created (${data.website.status}).`);
        setFormMode("list");
        fetchData();
      } else {
        showMessage(data.error || "Create failed", "error");
      }
    } else {
      const res = await fetch(`/api/websites/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        showMessage(`Website "${data.website.name}" saved.`);
        setFormMode("list");
        fetchData();
      } else {
        showMessage(data.error || "Save failed", "error");
      }
    }
  };

  const handleAction = async (id: string, action: string) => {
    if (!confirm(`Confirm ${action.replace(/-/g, " ")} for this website?`)) return;
    const res = await fetch(`/api/websites/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data.success) {
      showMessage(`${action.replace(/-/g, " ")} completed.`);
      fetchData();
    } else {
      showMessage(data.error || `${action} failed`, "error");
    }
  };

  const handlePreview = (w: Website) => {
    const content = w.content ? JSON.parse(w.content) : {};
    window.open(`/preview/${w.slug}`, "_blank");
  };

  const statusColor = (status: string) => STATUS_BADGE[status] || "bg-slate-700";

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-slate-400 font-mono text-sm">Loading Website Manager…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Website Manager</h1>
          <p className="text-sm text-slate-400 mt-1">Manage 10 starter website templates. Each project has independent data, content, theme, settings, and status.</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition shadow"
        >
          <span>+</span> New Website
        </button>
      </div>

      {message.text && (
        <div className={`p-3 rounded-xl text-sm font-mono border ${message.type === "success" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : message.type === "error" ? "bg-rose-500/10 border-rose-500/40 text-rose-300" : "bg-slate-800 border-slate-700 text-slate-300"}`}>
          {message.text}
        </div>
      )}

      {formMode === "create" || formMode === "edit" ? (
        <div className="bg-[#0b0f1f] border border-slate-800 rounded-2xl p-6 max-w-2xl">
          <h2 className="text-lg font-bold mb-4">{formMode === "create" ? "Create New Website" : "Edit Website"}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Website Name</label>
                <input
                  name="name"
                  defaultValue={website?.name || ""}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-brand-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Starter Template</label>
                <select
                  name="templateId"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-brand-500"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id} disabled={!t.id}>
                      {TEMPLATE_LABELS[t.id] || t.name} — {t.category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Customer (optional)</label>
                <input
                  name="customerId"
                  defaultValue={website?.customerId || ""}
                  placeholder="Customer ID"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-400 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lead (optional)</label>
                <input
                  name="leadId"
                  defaultValue={website?.leadId || ""}
                  placeholder="Lead ID"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-400 focus:border-brand-500"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-800">
              <button type="submit" className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-xl font-bold transition">
                {formMode === "create" ? "Create Website" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormMode("list");
                  setWebsite(null);
                  setActiveId(null);
                }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-bold border border-slate-700 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-800 rounded-xl bg-[#0b0f1f]/50">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 uppercase">
                  <th className="p-3">Name</th>
                  <th className="p-3">Template</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Owner Approved</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {websites.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500 text-sm">
                      No websites yet. Create your first starter project above.
                    </td>
                  </tr>
                ) : (
                  websites.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-900/30">
                      <td className="p-3 font-mono text-sm">{w.name}</td>
                      <td className="p-3 text-xs text-slate-300">{TEMPLATE_LABELS[w.template] || w.template}</td>
                      <td className="p-3 text-xs font-mono text-slate-400">{w.slug}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${statusColor(w.status)}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs">
                        {w.ownerApproved ? (
                          <span className="text-emerald-400 font-mono">✓ {w.ownerApprovedBy || "owner"}</span>
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handlePreview(w)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs rounded-lg hover:bg-blue-600/40 transition"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => handleEdit(w.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 border border-slate-600 text-slate-300 text-xs rounded-lg hover:bg-slate-600 transition"
                          >
                            Edit
                          </button>
                          {w.isArchived ? (
                            <button
                              onClick={() => handleAction(w.id, "reopen")}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs rounded-lg hover:bg-emerald-600/40 transition"
                            >
                              Reopen
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAction(w.id, "archive")}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 border border-rose-500/40 text-rose-300 text-xs rounded-lg hover:bg-rose-600/40 transition"
                            >
                              Archive
                            </button>
                          )}
                          <button
                            onClick={() => handleAction(w.id, "duplicate")}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white text-xs rounded-lg hover:bg-slate-500 transition"
                          >
                            Duplicate
                          </button>
                          {!w.ownerApproved ? (
                            <button
                              onClick={() => handleAction(w.id, "request-owner-approval")}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-slate-900 font-bold text-xs rounded-lg hover:bg-amber-400 transition"
                            >
                              Request Owner Approval
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAction(w.id, "approve")}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-500 transition"
                            >
                              Approve (Owner)
                            </button>
                          )}
                          {w.ownerApproved && w.status === "APPROVED" ? (
                            <button
                              onClick={() => handleAction(w.id, "publish")}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white font-bold text-xs rounded-lg hover:bg-purple-500 transition"
                            >
                              Publish
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <h2 className="col-span-1 text-sm font-bold text-slate-400 uppercase">Available Starter Templates</h2>
            <div className="col-span-2 flex gap-2 overflow-x-auto pb-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex-shrink-0 bg-[#0b0f1f] border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 min-w-[150px]"
                >
                  <div className="font-bold text-slate-100 mb-1">{TEMPLATE_LABELS[t.id] || t.name}</div>
                  <div className="text-slate-500">{t.category}</div>
                  <div className="text-[10px] text-slate-600 mt-1">{t.description}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
