import { useState, useCallback, useEffect } from "react";
import { useCamera } from "./useCamera";
import { CameraView } from "./CameraView";

interface CaptureResult {
  trace_id: string;
  photo_filename: string;
  status: string;
}

interface InventoryItem {
  id: string;
  identified_name: string | null;
  estimated_value: number | null;
  value_source: string | null;
  confidence: number | null;
  created_at: string;
}

function App() {
  const camera = useCamera();
  const [capturing, setCapturing] = useState(false);
  const [lastResult, setLastResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // Fetch inventory on mount
  useEffect(() => {
    fetch("/api/inventory")
      .then((r) => r.json())
      .then(setInventory)
      .catch(() => {});
  }, []);

  const handleSubmit = useCallback(async (blob: Blob) => {
    setCapturing(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", blob, "capture.jpg");

      const res = await fetch("/api/capture", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server returned ${res.status}`);
      }

      const data: CaptureResult = await res.json();
      setLastResult(data);

      // Refresh inventory
      const inv = await fetch("/api/inventory").then((r) => r.json());
      setInventory(inv);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setCapturing(false);
    }
  }, []);

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

          {lastResult && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
              Captured! Trace: {lastResult.trace_id}
            </div>
          )}
        </section>

        {/* Inventory — card #6 placeholder */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            Inventory ({inventory.length})
          </h2>
          {inventory.length === 0 ? (
            <p className="text-gray-500">No items cataloged yet. Capture something above.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {inventory.map((item) => (
                <div key={item.id} className="border rounded-lg p-4">
                  <p className="font-medium text-gray-900">
                    {item.identified_name ?? "Unidentified"}
                  </p>
                  {item.estimated_value != null && (
                    <p className="text-lg font-bold text-green-700">
                      ${item.estimated_value.toLocaleString()}
                    </p>
                  )}
                  {item.value_source && (
                    <p className="text-xs text-gray-400 mt-1">
                      Source: {item.value_source}
                      {item.confidence != null && ` (${Math.round(item.confidence * 100)}%)`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;

