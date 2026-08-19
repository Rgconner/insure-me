import type { ReactNode } from "react";

function App(): ReactNode {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Insure Me</h1>
          <span className="text-sm text-gray-500">Vision-powered inventory</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Camera Capture — card #1 placeholder */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Capture</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center text-gray-500">
            Camera viewfinder placeholder — card #1
          </div>
        </section>

        {/* Inventory — card #6 placeholder */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Inventory</h2>
          <p className="text-gray-500">No items cataloged yet.</p>
        </section>
      </main>
    </div>
  );
}

export default App;
