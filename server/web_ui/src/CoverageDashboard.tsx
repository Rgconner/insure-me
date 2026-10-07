import { useState, useCallback } from "react";

interface CoverageResult {
  policy_id: string; policy_name: string; overall_limit: number;
  deductible: number; total_value: number; total_gap: number;
  summary: { covered: number; coverage_gap: number; not_covered: number; needs_validation: number };
  category_breakdowns: { category: string; total_value: number; limit: number; exclusion: boolean; gap: number }[];
  items: CoverageItem[];
  cross_policy?: { item_id: string; item_name: string; gap_category: string; alternate_policy: string; alternate_limit: number }[];
}

interface CoverageItem {
  id: string; photo_path: string; identified_name: string | null;
  estimated_value: number | null; mapped_category: string;
  coverage_status: string; coverage_gap_amount: number; coverage_detail: string;
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; border: string; symbol: string }> = {
  covered: { label: "Covered", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", symbol: "\u2714" },
  coverage_gap: { label: "Coverage Gap", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa", symbol: "\u26A1" },
  not_covered: { label: "Not Covered", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", symbol: "\u2718" },
  needs_validation: { label: "Needs Validation", color: "#ca8a04", bg: "#fefce8", border: "#fef08a", symbol: "\u26A0" },
};

interface Props {
  onRefresh: () => void;
}

export function CoverageDashboard({ onRefresh }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, _setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const runComparison = useCallback(async () => {
    setRunning(true); setError(null);
    try {
      const res = await fetch("/api/compare-coverage", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data: CoverageResult = await res.json();
      setResult(data);
      onRefresh();  // inventory now has coverage fields
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setRunning(false); }
  }, [onRefresh]);

  if (!result) {
    return (
      <div className="text-center py-4">
        <button onClick={runComparison} disabled={running}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
          {running ? (<>Running comparison...</>) : "Compare Inventory to Policy"}
        </button>
        {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      </div>
    );
  }

  const { summary, total_value, total_gap, overall_limit, deductible, category_breakdowns, items, cross_policy } = result;
  const total = summary.covered + summary.coverage_gap + summary.not_covered + summary.needs_validation;
  const coveredPct = total > 0 ? Math.round((summary.covered / total) * 100) : 0;
  const hasIssues = summary.coverage_gap > 0 || summary.not_covered > 0 || summary.needs_validation > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Coverage Analysis</h3>
        <button onClick={runComparison} disabled={running}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
          {running ? "Re-running..." : "Refresh"}</button>
      </div>

      {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      {/* Summary Bar */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-end gap-4">
          <div>
            <p className="text-xs text-gray-500">Total Inventory Value</p>
            <p className="text-2xl font-bold">${total_value.toLocaleString()}</p>
          </div>
          <div className="flex-1">
            <div className="flex h-6 rounded-full overflow-hidden bg-gray-200">
              {summary.covered > 0 && (
                <div style={{ width: ((summary.covered / total) * 100) + "%" }}
                  className="bg-green-500" title={`${summary.covered} covered`} />
              )}
              {summary.coverage_gap > 0 && (
                <div style={{ width: ((summary.coverage_gap / total) * 100) + "%" }}
                  className="bg-orange-500" title={`${summary.coverage_gap} gaps`} />
              )}
              {summary.not_covered > 0 && (
                <div style={{ width: ((summary.not_covered / total) * 100) + "%" }}
                  className="bg-red-500" title={`${summary.not_covered} not covered`} />
              )}
              {summary.needs_validation > 0 && (
                <div style={{ width: ((summary.needs_validation / total) * 100) + "%" }}
                  className="bg-yellow-400" title={`${summary.needs_validation} needs validation`} />
              )}
            </div>
            <div className="flex gap-4 mt-1 text-xs text-gray-600">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                {summary.covered} Covered ({coveredPct}%)</span>
              {summary.coverage_gap > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                {summary.coverage_gap} Gaps</span>}
              {summary.not_covered > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                {summary.not_covered} Not Covered</span>}
              {summary.needs_validation > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                {summary.needs_validation} Needs Review</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>Overall Limit: ${overall_limit.toLocaleString()}</span>
          <span>Deductible: ${deductible.toLocaleString()}</span>
          {total_gap > 0 && <span className="text-orange-600 font-medium">Overall Gap: ${total_gap.toLocaleString()}</span>}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 text-xs">
        <button onClick={() => setFilter(null)} className={`px-2 py-1 rounded ${!filter ? "bg-gray-200 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>All</button>
        <button onClick={() => setFilter("covered")} className={`px-2 py-1 rounded ${filter === "covered" ? "bg-green-100 text-green-800 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>Covered</button>
        <button onClick={() => setFilter("coverage_gap")} className={`px-2 py-1 rounded ${filter === "coverage_gap" ? "bg-orange-100 text-orange-800 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>Gaps</button>
        <button onClick={() => setFilter("not_covered")} className={`px-2 py-1 rounded ${filter === "not_covered" ? "bg-red-100 text-red-800 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>Not Covered</button>
        <button onClick={() => setFilter("needs_validation")} className={`px-2 py-1 rounded ${filter === "needs_validation" ? "bg-yellow-100 text-yellow-800 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>Needs Review</button>
      </div>


      {/* Drill-down */}
      <div className={(hasIssues ? "" : "hidden") + " space-y-2"}>
        {items.filter(i => !filter || i.coverage_status === filter).map((item) => {
          const st = STATUS_STYLE[item.coverage_status] || STATUS_STYLE.needs_validation;
          return (
            <div key={item.id} className="border rounded-lg p-3" style={{ background: st.bg, borderColor: st.border }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg" title={st.label}>{st.symbol}</span>
                  <div>
                    <p className="font-medium text-sm">{item.identified_name || "Unidentified"}</p>
                    {item.estimated_value != null && item.estimated_value > 0 && (
                      <p className="font-bold">${item.estimated_value.toLocaleString()}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ color: st.color, background: st.border }}>{st.label}</span>
              </div>
              <p className="text-xs mt-1" style={{ color: st.color }}>{item.coverage_detail}</p>
              {item.coverage_gap_amount > 0 && (
                <p className="text-xs font-bold mt-0.5" style={{ color: st.color }}>
                  Gap: ${item.coverage_gap_amount.toLocaleString()}
                </p>
              )}
              {/* Cross-policy suggestions */}
              {cross_policy && cross_policy.filter(cp => cp.item_id === item.id).map(cp => (
                <p key={cp.item_id + cp.alternate_policy} className="text-xs text-blue-600 mt-1">
                  {cp.alternate_policy} covers {cp.gap_category} up to ${cp.alternate_limit.toLocaleString()}
                </p>
              ))}
            </div>
          );
        })}
      </div>

      {/* Category breakdowns */}
      {category_breakdowns.length > 0 && expanded !== null && (
        <div className="border rounded-lg p-3 text-xs">
          <h4 className="font-medium mb-2">Category Breakdowns</h4>
          {category_breakdowns.map(cat => (
            <div key={cat.category} className="flex justify-between py-1 border-t border-gray-100">
              <span className="capitalize">{cat.category.replace("_", " ")}
                {cat.exclusion ? " (EXCLUDED)" : ""}</span>
              <span className={cat.gap > 0 ? "text-orange-600 font-medium" : "text-green-700"}>
                ${cat.total_value.toLocaleString()} / ${cat.limit.toLocaleString()}
                {cat.gap > 0 && ` — ${cat.exclusion ? "not covered" : "$${cat.gap.toLocaleString()} gap"}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
