import { useState, useCallback, useEffect } from "react";
import { useCamera } from "./useCamera";
import { PolicyUpload } from "./PolicyUpload";
import { CameraView } from "./CameraView";
import { InventoryList } from "./InventoryList";
import type { InventoryItem } from "./InventoryList";

interface CaptureResult {
  trace_id: string;
  photo_filename: string;
  status: string;
}

interface PipelineResult {
  status: string;
  identified_name?: string;
  confidence?: string;
  estimated_value?: number;
  value_source?: string;
  error?: string;
  photo_filename?: string;
}

function App() {
  const camera = useCamera();
  const [capturing, setCapturing] = useState(false);
  const [lastResult, setLastResult] = useState<CaptureResult | null>(null);
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const refreshInventory = useCallback(() => {
    const url = showArchived
      ? "/api/inventory?show_all=true"
      : "/api/inventory";
    fetch(url)
      .then((r) => r.json())
      .then(setInventory)
      .catch(() => {});
  }, [showArchived]);

  // Fetch inventory on mount
  useEffect(() => {
    refreshInventory();
  }, [refreshInventory]);

  // Poll the pipeline status until identification + pricing settle.
  const pollPipeline = useCallback(async (traceId: string) => {
    const start = Date.now();
    while (Date.now() - start < 120000) {
      try {
        const r = await fetch(`/api/capture/${traceId}`);
        if (r.ok) {
          const s: PipelineResult = await r.json();
          setPipeline(s);
          if (["priced", "failed"].includes(s.status)) {
            return;
          }
        }
      } catch {
        // transient — keep polling
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
  }, []);

  const handleSubmit = useCallback(async (blob: Blob, narration: string,
      lat: number | null, lng: number | null) => {
    setCapturing(true);
    setError(null);
    setPipeline({ status: "captured" });

    try {
      const form = new FormData();
      form.append("file", blob, "capture.jpg");
      form.append("narration", narration);
      if (lat != null && lng != null) {
        form.append("lat", String(lat));
        form.append("lng", String(lng));
      }

      const res = await fetch("/api/capture", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server returned ${res.status}`);
      }

      const data: CaptureResult = await res.json();
      setLastResult(data);

      // Fire-and-forget pipeline polling — updates `pipeline` as it settles.
      void pollPipeline(data.trace_id);

      // Refresh inventory
      refreshInventory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPipeline(null);
    } finally {
      setCapturing(false);
    }
  }, [pollPipeline, refreshInventory]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Insure Me</h1>
          <span className="text-sm text-gray-500">Vision-powered inventory</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Camera Capture — card #1 */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Capture</h2>
          <CameraView
            camera={camera}
            onCapture={() => {}}
            onSubmit={handleSubmit}
            capturing={capturing}
          />

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {pipeline && (
            <div className="mt-4 p-4 rounded border text-sm">
              {pipeline.status === "captured" && (
                <div className="bg-gray-50 border-gray-200 text-gray-600">
                  <p>Identifying…</p>
                </div>
              )}
              {pipeline.status === "identified" && (
                <div className="bg-blue-50 border-blue-200 text-blue-800">
                  <p className="font-medium">Identified: {pipeline.identified_name}</p>
                  <p className="text-xs">Confidence: {pipeline.confidence} — estimating value…</p>
                </div>
              )}
              {pipeline.status === "priced" && (
                <div className="bg-green-50 border-green-200 text-green-800">
                  <p className="font-medium">Identified: {pipeline.identified_name}</p>
                  <p className="text-lg font-bold">
                    ${pipeline.estimated_value?.toLocaleString()}
                    {pipeline.value_source && (
                      <span className="text-xs font-normal text-green-600"> via {pipeline.value_source}</span>
                    )}
                  </p>
                  <p className="text-xs">{pipeline.confidence} confidence</p>
                </div>
              )}
              {pipeline.status === "failed" && (
                <div className="bg-red-50 border-red-200 text-red-700">
                  <p>{pipeline.error ?? "Identification failed"}</p>
                </div>
              )}
            </div>
          )}

          {lastResult && !pipeline && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
              Captured! Trace: {lastResult.trace_id}
            </div>
          )}
        </section>

        {/* Policy Upload — cards #14-#17 */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <PolicyUpload onPolicyReady={(p) => {
            // Policy ready for comparison (cards #18-#22)
            console.log("Policy ready:", p?.id);
          }} />
        </section>

        {/* Inventory — card #6 */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            Inventory ({inventory.length})
          </h2>
          <InventoryList
            items={inventory}
            photoFilename={lastResult?.photo_filename ?? null}
            suggestedName={pipeline?.identified_name ?? null}
            suggestedValue={pipeline?.estimated_value != null ? String(pipeline.estimated_value) : null}
            showArchived={showArchived}
            onToggleArchived={setShowArchived}
            onRefresh={refreshInventory}
          />
        </section>
      </main>
    </div>
  );
}

export default App;

