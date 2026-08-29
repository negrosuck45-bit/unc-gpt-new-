"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, ExternalLink, Loader2, ShieldCheck, Wrench } from "lucide-react";
import type { AuditIssue, WebsiteAuditReport } from "@/lib/website-audit";

type WebsiteRecoveryAuditProps = {
  onBack: () => void;
  onOpenSettings: () => void;
};

const severityClasses = {
  high: "border-rose-300/30 bg-rose-400/10 text-rose-100",
  medium: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  low: "border-sky-300/30 bg-sky-300/10 text-sky-100",
};

function issueLabel(issue: AuditIssue) {
  return `${issue.severity} priority · ${issue.category}`;
}

export function WebsiteRecoveryAudit({ onBack, onOpenSettings }: WebsiteRecoveryAuditProps) {
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<WebsiteAuditReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [approvalRecorded, setApprovalRecorded] = useState(false);

  const selectedIssues = useMemo(() => report?.issues.filter((issue) => selectedIds.includes(issue.id)) || [], [report, selectedIds]);

  const runAudit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setReport(null);
    setSelectedIds([]);
    setApprovalRecorded(false);
    setLoading(true);
    try {
      const response = await fetch("/api/recovery/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.report) throw new Error(payload.error || "The audit could not be completed.");
      setReport(payload.report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The audit could not be completed.");
    } finally {
      setLoading(false);
    }
  };

  const toggleIssue = (id: string) => {
    setApprovalRecorded(false);
    setSelectedIds((selected) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  return (
    <section className="h-full overflow-y-auto bg-[#0b0d12] text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-10">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
          <ArrowLeft className="h-4 w-4" /> Back to workspace
        </button>

        <header className="mt-6 grid gap-6 rounded-[28px] border border-white/[0.09] bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.18),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-6 shadow-2xl shadow-black/20 sm:grid-cols-[1fr_auto] sm:p-9">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.13em] text-violet-100"><ShieldCheck className="h-3.5 w-3.5" /> Recovery review</div>
            <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Audit first. Change only what you approve.</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-zinc-300">Run a safe baseline review of any public page. The report checks visible structure, responsive foundations, accessibility signals, internal destinations, and interactive-control labels. Suggested fixes remain a plan until you select them and explicitly approve a supported service.</p>
          </div>
          <div className="hidden h-20 w-20 items-center justify-center self-end rounded-3xl border border-white/[0.12] bg-white/[0.06] text-violet-200 sm:flex"><ClipboardCheck className="h-9 w-9" /></div>
        </header>

        <form onSubmit={runAudit} className="mt-7 rounded-[24px] border border-white/[0.09] bg-white/[0.035] p-4 sm:flex sm:items-end sm:gap-3 sm:p-5">
          <label className="block flex-1">
            <span className="mb-2 block text-sm font-medium text-zinc-200">Public website URL</span>
            <input data-testid="recovery-audit-url" type="url" required inputMode="url" autoComplete="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" className="h-12 w-full rounded-xl border border-white/[0.12] bg-[#11141b] px-4 text-[15px] text-white outline-none placeholder:text-zinc-600 transition focus:border-violet-300/70 focus:ring-4 focus:ring-violet-300/10" />
          </label>
          <button data-testid="run-recovery-audit" type="submit" disabled={loading} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#16181e] transition hover:bg-violet-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 sm:mt-0 sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{loading ? "Auditing website" : "Run audit"}
          </button>
        </form>
        {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-300/25 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

        {report && <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-[24px] border border-white/[0.09] bg-white/[0.035] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Audit results</p><a href={report.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-2 break-all text-base font-medium text-white underline-offset-4 hover:text-violet-200 hover:underline"><span>{report.url}</span><ExternalLink className="h-4 w-4 shrink-0" /></a><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">{report.summary}</p></div>
                <div className="rounded-2xl border border-violet-300/20 bg-violet-300/10 px-4 py-3 text-center"><span className="block text-2xl font-semibold text-white">{report.score}</span><span className="text-xs font-medium uppercase tracking-[0.11em] text-violet-200">Baseline score</span></div>
              </div>
              <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{report.checks.map((check) => <div key={check.category} className="rounded-xl border border-white/[0.07] bg-black/15 p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{check.category}</p><p className="mt-1 text-xs leading-5 text-zinc-300">{check.label}</p><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${check.status === "pass" ? "bg-emerald-400/10 text-emerald-200" : check.status === "issue" ? "bg-rose-400/10 text-rose-200" : "bg-amber-300/10 text-amber-100"}`}>{check.status}</span></div>)}</div>
              {report.renderedReview && <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/15 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">Rendered desktop, mobile & interaction review</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${report.renderedReview.status === "complete" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>{report.renderedReview.status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{report.renderedReview.notes}</p></div>}
            </section>

            <section className="rounded-[24px] border border-white/[0.09] bg-white/[0.035] p-5 sm:p-6">
              <div className="flex items-end justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">Suggested remediation</h2><p className="mt-1 text-sm text-zinc-400">Select the issues you want to put through the review queue.</p></div><span className="text-xs text-zinc-500">{report.issues.length} found</span></div>
              {report.issues.length === 0 ? <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.07] p-4 text-sm leading-6 text-emerald-100"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />No automated baseline issues were found. Continue with a manual visual and task-based review before publishing a change.</div> : <div className="mt-5 space-y-3">{report.issues.map((issue) => <label key={issue.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.08] bg-black/15 p-4 transition hover:border-white/[0.17] hover:bg-white/[0.04]"><input type="checkbox" checked={selectedIds.includes(issue.id)} onChange={() => toggleIssue(issue.id)} className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent accent-violet-300" /><span className="min-w-0 flex-1"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${severityClasses[issue.severity]}`}>{issueLabel(issue)}</span><span className="mt-2 block text-sm font-semibold text-zinc-100">{issue.title}</span><span className="mt-1 block text-sm leading-6 text-zinc-400">{issue.detail}</span><span className="mt-3 block text-sm leading-6 text-violet-200">Recommendation: {issue.recommendation}</span></span></label>)}</div>}
            </section>
          </div>

          <aside className="h-fit rounded-[24px] border border-white/[0.09] bg-[linear-gradient(160deg,rgba(139,92,246,0.12),rgba(255,255,255,0.025))] p-5 sm:p-6 lg:sticky lg:top-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-300/15 text-violet-100"><Wrench className="h-5 w-5" /></div>
            <h2 className="mt-4 text-lg font-semibold text-white">Review & approval</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{selectedIssues.length ? `${selectedIssues.length} remediation item${selectedIssues.length === 1 ? " is" : "s are"} selected.` : "Select one or more recommendations to begin a remediation plan."}</p>
            <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/20 p-3 text-xs leading-5 text-zinc-400">No repository, deployment, connector, or email action is performed from this screen. A service must be authorized in Connectors before an approved plan can be carried out.</div>
            <button type="button" disabled={!selectedIssues.length} onClick={() => setApprovalRecorded(true)} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-200 px-4 text-sm font-semibold text-[#20183b] transition hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"><ClipboardCheck className="h-4 w-4" />Approve selected plan</button>
            {approvalRecorded && <div role="status" className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-400/10 p-3 text-sm leading-6 text-emerald-100">Your remediation plan is approved for review. Authorize the applicable supported service in Connectors before asking the workspace to perform any external change or email action.</div>}
            <button type="button" onClick={onOpenSettings} className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 text-sm font-medium text-white transition hover:bg-white/[0.1]">Open Connectors</button>
          </aside>
        </div>}
      </div>
    </section>
  );
}
