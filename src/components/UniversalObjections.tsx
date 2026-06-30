import { useState, type FormEvent } from 'react';
import { HelpCircle, Plus, Pencil, Trash2, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { useStoreData } from '../hooks/useStoreData';
import type { UniversalObjection } from '../types';

const EMPTY_FORM = {
  id: '',
  titulo: '',
  respuesta: '',
  order: 1,
  key: '',
};

type FormState = typeof EMPTY_FORM;

export default function UniversalObjections() {
  const {
    universalObjections,
    addUniversalObjection,
    updateUniversalObjection,
    deleteUniversalObjection,
  } = useStoreData();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const flash = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (obj: UniversalObjection) => {
    setForm({
      id: obj.id,
      titulo: obj.titulo,
      respuesta: obj.respuesta,
      order: obj.order ?? 1,
      key: obj.key ?? '',
    });
    setEditingId(obj.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const now = Date.now();
    try {
      if (editingId) {
        const existing = universalObjections.find((o) => o.id === editingId)!;
        await updateUniversalObjection({
          ...existing,
          titulo: form.titulo.trim(),
          respuesta: form.respuesta.trim(),
          order: form.order,
          key: form.key.trim() || undefined,
          updatedAt: now,
        });
        flash('success', 'Objeción actualizada correctamente.');
      } else {
        await addUniversalObjection({
          id: form.id.trim(),
          titulo: form.titulo.trim(),
          respuesta: form.respuesta.trim(),
          order: form.order,
          key: form.key.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        });
        flash('success', 'Objeción creada correctamente.');
      }
      closeForm();
    } catch (err: any) {
      flash('error', err?.message || 'Error al guardar. Revisa los datos.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteUniversalObjection(deleteId);
      flash('success', 'Objeción eliminada.');
    } catch (err: any) {
      flash('error', err?.message || 'Error al eliminar.');
    } finally {
      setDeleteId(null);
    }
  };

  const sorted = [...universalObjections].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Objeciones Generales</h1>
            <p className="text-sm text-zinc-400">Aplican a toda la tienda</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nueva objeción
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">
              {editingId ? 'Editar objeción' : 'Nueva objeción general'}
            </h2>
            <button onClick={closeForm} className="text-zinc-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  ID <span className="text-rose-400">*</span>
                  {editingId && <span className="ml-1 text-zinc-600">(no editable)</span>}
                </label>
                <input
                  type="text"
                  value={form.id}
                  onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                  disabled={!!editingId}
                  required
                  placeholder="garantia"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Clave (key)</label>
                <input
                  type="text"
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  placeholder="garantia"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Orden</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: parseInt(e.target.value) || 1 }))}
                  min={1}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Pregunta <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                required
                placeholder="¿Tiene garantía / es original?"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Respuesta <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={form.respuesta}
                onChange={(e) => setForm((f) => ({ ...f, respuesta: e.target.value }))}
                required
                rows={4}
                placeholder="Sí, es original y tiene 3 meses de garantía..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="bg-zinc-900 border border-rose-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">¿Eliminar esta objeción?</p>
              <p className="text-xs text-zinc-400 mt-0.5">Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setDeleteId(null)}
                className="px-3 py-1.5 text-xs border border-zinc-700 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-500 transition-colors font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider w-12">Ord.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Pregunta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider hidden lg:table-cell">Respuesta</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-500 text-sm">
                    No hay objeciones generales. Crea la primera con el botón de arriba.
                  </td>
                </tr>
              ) : (
                sorted.map((obj) => (
                  <tr key={obj.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 text-zinc-500 text-xs">{obj.order ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-zinc-800 text-cyan-400 px-2 py-0.5 rounded">
                        {obj.id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-200">{obj.titulo}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs max-w-xs truncate hidden lg:table-cell">
                      {obj.respuesta}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(obj)}
                          className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-md transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(obj.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
