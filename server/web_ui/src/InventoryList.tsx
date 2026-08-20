import { useState, useCallback } from 'react';

export interface InventoryItem {
  id: string;
  photo_path: string;
  identified_name: string | null;
  estimated_value: number | null;
  value_source: string | null;
  confidence: number | null;
  narration: string;
  created_at: string;
}

interface Props {
  items: InventoryItem[];
  photoFilename: string | null;
  onRefresh: () => void;
}

export function InventoryList({ items, photoFilename, onRefresh }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) return;
    setAdding(true); setError(null);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trace_id: crypto.randomUUID(),
          photo_filename: photoFilename || '',
          identified_name: newName.trim(),
          estimated_value: parseFloat(newValue) || 0,
          value_source: 'manual',
          confidence: 0.5,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewName(''); setNewValue('');
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setAdding(false); }
  }, [newName, newValue, photoFilename, onRefresh]);

  const handleEdit = useCallback(async (id: string) => {
    if (!editName.trim()) return;
    setAdding(true); setError(null);
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identified_name: editName.trim(),
          estimated_value: parseFloat(editValue) || 0,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingId(null);
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setAdding(false); }
  }, [editName, editValue, onRefresh]);

  const handleDelete = useCallback(async (id: string) => {
    setAdding(true); setError(null);
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setDeletingId(null);
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setAdding(false); }
  }, [onRefresh]);

  const startEdit = useCallback((item: InventoryItem) => {
    setEditingId(item.id);
    setEditName(item.identified_name || '');
    setEditValue(item.estimated_value?.toString() || '');
  }, []);
  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Add to Catalog form (shown after capture) */}
      {photoFilename && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-3">Add to Catalog</h3>
          <div className="flex items-start gap-4">
            <img src={`/uploads/${photoFilename}`} alt="Captured"
              className="w-24 h-18 object-cover rounded border" />
            <div className="flex-1 space-y-2">
              <input type="text" placeholder="Item name (e.g., Leather Couch)"
                value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <input type="number" step="0.01" placeholder="Estimated value ($)"
                  value={newValue} onChange={(e) => setNewValue(e.target.value)}
                  className="w-40 px-3 py-2 border rounded text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={handleAdd} disabled={adding || !newName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium
                             hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {adding ? 'Adding...' : 'Add to Catalog'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory grid */}
      {items.length === 0 && !photoFilename ? (
        <p className="text-gray-500 text-center py-8">
          No items cataloged yet. Capture a photo above to get started.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="border rounded-lg overflow-hidden bg-white">
              {item.photo_path && (
                <img src={`/uploads/${item.photo_path}`}
                  alt={item.identified_name || 'Item'}
                  className="w-full h-40 object-cover" />
              )}
              <div className="p-4">
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <input type="text" value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm" />
                    <div className="flex gap-2 items-center">
                      <span className="text-sm text-gray-500">$</span>
                      <input type="number" step="0.01" value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-32 px-2 py-1 border rounded text-sm" />
                      <button onClick={() => handleEdit(item.id)} disabled={adding}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs
                                   hover:bg-green-700 disabled:opacity-50">Save</button>
                      <button onClick={() => setEditingId(null)}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-xs
                                   hover:bg-gray-300">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-gray-900">
                      {item.identified_name || 'Unidentified'}</p>
                    {item.estimated_value != null && item.estimated_value > 0 && (
                      <p className="text-lg font-bold text-green-700">
                        ${item.estimated_value.toLocaleString()}</p>
                    )}
                    {item.value_source && (
                      <p className="text-xs text-gray-400 mt-1">
                        via {item.value_source}
                        {item.confidence != null &&
                          ` \u00b7 ${Math.round(item.confidence * 100)}% confidence`}</p>
                    )}
                    {item.narration && (
                      <p className="text-xs text-gray-500 italic mt-1 border-l-2 border-yellow-300 pl-2">
                        &ldquo;{item.narration}&rdquo;
                      </p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => startEdit(item)}
                        className="text-xs text-blue-600 hover:underline">Edit</button>
                      {deletingId === item.id ? (
                        <span className="text-xs text-red-600">
                          Delete?{' '}
                          <button onClick={() => handleDelete(item.id)}
                            className="font-bold hover:underline">Yes</button>
                          {' / '}
                          <button onClick={() => setDeletingId(null)}
                            className="hover:underline">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setDeletingId(item.id)}
                          className="text-xs text-red-500 hover:underline">Delete</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

