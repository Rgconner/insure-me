import { useState, useCallback } from "react";

interface PolicyRecord {
  id: string; name: string; overall_limit: number; deductible: number;
  effective_date: string; expiration_date: string; covered_address: string;
  active: number; reviewed: number; version: number; raw_text: string;
  sub_limits?: SubLimit[];
}

interface SubLimit {
  id: string; policy_id: string; category: string; limit_amount: number;
  exclusion: number; description: string; applies_to: string; rider: number;
}

interface Props { onPolicyReady: (policy: PolicyRecord | null) => void; }

export function PolicyUpload({ onPolicyReady }: Props) {
  const [mode, setMode] = useState<"upload" | "file" | "text" | null>(null);
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<PolicyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editDeductible, setEditDeductible] = useState("");
  const [editEffective, setEditEffective] = useState("");
  const [editExpiration, setEditExpiration] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editSubLimits, setEditSubLimits] = useState<SubLimit[]>([]);

  const handleUpload = useCallback(async (formData: FormData) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/policies/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const p: PolicyRecord = await res.json();
      setPolicy(p); startEdit(p); onPolicyReady(p);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }, [onPolicyReady]);

  const startEdit = (p: PolicyRecord) => {
    setEditName(p.name || ""); setEditLimit(p.overall_limit?.toString() || "");
    setEditDeductible(p.deductible?.toString() || ""); setEditEffective(p.effective_date || "");
    setEditExpiration(p.expiration_date || ""); setEditAddress(p.covered_address || "");
    setEditSubLimits((p.sub_limits || []).map(sl => ({ ...sl })));
  };

  const handleUrlSubmit = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/policies/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), name: url.split("/").pop() || "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const p: PolicyRecord = await res.json();
      setPolicy(p); startEdit(p); onPolicyReady(p);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }, [url, onPolicyReady]);

  const handleTextSubmit = useCallback(async () => {
    if (!pastedText.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/policies/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedText.trim(), name: "Pasted Policy" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const p: PolicyRecord = await res.json();
      setPolicy(p); startEdit(p); onPolicyReady(p);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }, [pastedText, onPolicyReady]);

  const handleParse = useCallback(async () => {
    if (!policy) return;
    setParsing(true); setError(null);
    try {
      const res = await fetch(`/api/policies/${policy.id}/parse`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setParsedData(result.parsed_from_llm);
      const updated = { ...result, sub_limits: result.sub_limits };
      setPolicy(updated); startEdit(updated); onPolicyReady(updated);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setParsing(false); }
  }, [policy, onPolicyReady]);

  const handleSaveEdits = useCallback(async () => {
    if (!policy) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/policies/${policy.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName, overall_limit: parseFloat(editLimit) || 0,
          deductible: parseFloat(editDeductible) || 0,
          effective_date: editEffective, expiration_date: editExpiration,
          covered_address: editAddress, reviewed: true,
          sub_limits: editSubLimits.map(sl => ({
            category: sl.category, limit_amount: sl.limit_amount,
            exclusion: !!sl.exclusion, description: sl.description,
            applies_to: sl.applies_to || "", rider: !!sl.rider,
          })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const p: PolicyRecord = await res.json();
      setPolicy(p); onPolicyReady(p);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }, [policy, editName, editLimit, editDeductible, editEffective, editExpiration, editAddress, editSubLimits, onPolicyReady]);

  const addSubLimit = () => {
    setEditSubLimits(prev => [...prev, {
      id: "", policy_id: policy?.id || "", category: "other", limit_amount: 0,
      exclusion: 0, description: "", applies_to: "", rider: 0,
    }]);
  };

  const loadingSpinner = (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      {loading ? "Uploading..." : parsing ? "Parsing with AI..." : "Working..."}
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Insurance Policy</h3>
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      {!policy && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 text-center transition-colors">
            <p className="text-2xl mb-2">&#128196;</p>
            <p className="font-medium text-gray-700">Upload PDF</p>
            <p className="text-xs text-gray-400 mt-1">Drag and drop or click</p>
            <input type="file" accept=".pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append("file", f); handleUpload(fd); } }} />
          </label>
          <button onClick={() => setMode("file")}
            className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 text-center transition-colors">
            <p className="text-2xl mb-2">&#127760;</p>
            <p className="font-medium text-gray-700">From URL</p>
            <p className="text-xs text-gray-400 mt-1">Paste a link to a PDF</p>
          </button>
          <button onClick={() => setMode("text")}
            className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 text-center transition-colors">
            <p className="text-2xl mb-2">&#128221;</p>
            <p className="font-medium text-gray-700">Paste Text</p>
            <p className="text-xs text-gray-400 mt-1">Copy policy text directly</p>
          </button>
        </div>
      )}

      {mode === "file" && !policy && (
        <div className="flex gap-2">
          <input type="text" placeholder="https://example.com/policy.pdf"
            value={url} onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-3 py-2 border rounded text-sm" />
          <button onClick={handleUrlSubmit} disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? "..." : "Upload"}</button>
          <button onClick={() => setMode(null)} className="px-3 py-2 text-sm text-gray-500 hover:underline">Cancel</button>
        </div>
      )}

      {mode === "text" && !policy && (
        <div className="space-y-2">
          <textarea placeholder="Paste your insurance policy text here..."
            value={pastedText} onChange={(e) => setPastedText(e.target.value)}
            rows={10} className="w-full px-3 py-2 border rounded text-sm" />
          <div className="flex gap-2">
            <button onClick={handleTextSubmit} disabled={loading || !pastedText.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? "..." : "Submit"}</button>
            <button onClick={() => setMode(null)} className="px-3 py-2 text-sm text-gray-500 hover:underline">Cancel</button>
          </div>
        </div>
      )}

      {(loading || parsing) && loadingSpinner}

      {policy && (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{editName || policy.name}</h4>
            <div className="flex gap-2">
              {!parsedData && !policy.reviewed && (
                <button onClick={handleParse} disabled={parsing}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50">
                  {parsing ? "Parsing..." : "\u2728 Parse with AI"}</button>
              )}
              <button onClick={handleSaveEdits} disabled={loading}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50">
                Save Changes</button>
            </div>
          </div>

          {parsedData && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs">
              AI parsed this policy. Review and correct before saving.
            </div>
          )}
          {policy.reviewed === -1 && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              AI parsing failed. Please enter values manually.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="text-xs text-gray-500">Policy Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm" /></div>
            <div><label className="text-xs text-gray-500">Overall PP Limit ($)</label>
              <input type="number" step="0.01" value={editLimit} onChange={(e) => setEditLimit(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm" /></div>
            <div><label className="text-xs text-gray-500">Deductible ($)</label>
              <input type="number" step="0.01" value={editDeductible} onChange={(e) => setEditDeductible(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm" /></div>
            <div><label className="text-xs text-gray-500">Effective Date</label>
              <input type="date" value={editEffective} onChange={(e) => setEditEffective(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm" /></div>
            <div><label className="text-xs text-gray-500">Expiration Date</label>
              <input type="date" value={editExpiration} onChange={(e) => setEditExpiration(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm" /></div>
            <div><label className="text-xs text-gray-500">Covered Address</label>
              <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm" /></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Sub-Limits and Exclusions</label>
              <button onClick={addSubLimit} className="text-xs text-blue-600 hover:underline">+ Add</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-500">
                  <th className="pb-1 pr-2">Category</th><th className="pb-1 pr-2">Limit ($)</th>
                  <th className="pb-1 pr-2">Excluded</th><th className="pb-1 pr-2">Description</th>
                  <th className="pb-1"></th></tr></thead>
                <tbody>
                  {editSubLimits.map((sl, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1 pr-2">
                        <input type="text" value={sl.category}
                          onChange={(e) => { const copy = [...editSubLimits]; copy[i] = { ...copy[i], category: e.target.value }; setEditSubLimits(copy); }}
                          className="w-24 px-1 py-0.5 border rounded" /></td>
                      <td className="py-1 pr-2">
                        <input type="number" value={sl.limit_amount}
                          onChange={(e) => { const copy = [...editSubLimits]; copy[i] = { ...copy[i], limit_amount: parseFloat(e.target.value) || 0 }; setEditSubLimits(copy); }}
                          className="w-20 px-1 py-0.5 border rounded" /></td>
                      <td className="py-1 pr-2 text-center">
                        <input type="checkbox" checked={!!sl.exclusion}
                          onChange={(e) => { const copy = [...editSubLimits]; copy[i] = { ...copy[i], exclusion: e.target.checked ? 1 : 0 }; setEditSubLimits(copy); }} /></td>
                      <td className="py-1 pr-2">
                        <input type="text" value={sl.description}
                          onChange={(e) => { const copy = [...editSubLimits]; copy[i] = { ...copy[i], description: e.target.value }; setEditSubLimits(copy); }}
                          className="w-32 px-1 py-0.5 border rounded" /></td>
                      <td className="py-1">
                        <button onClick={() => setEditSubLimits(prev => prev.filter((_, j) => j !== i))}
                          className="text-red-500 hover:underline">x</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
