import { useState, useMemo, type FormEvent, useEffect } from 'react';
import { Tag, Plus, Pencil, Trash2, CheckCircle, AlertTriangle, X, Filter } from 'lucide-react';
import { useStoreData } from '../hooks/useStoreData';
import { slugify } from '../lib/validations';
import type { CategoryObjection } from '../types';

const EMPTY_FORM = {
  id: '',
  categorySlug: '',
  pregunta: '',
  respuesta: '',
  orden: 1,
};

type FormState = typeof EMPTY_FORM;

export default function CategoryObjections() {
  const {
    products,
    categoryObjections,
    addCategoryObjection,
    updateCategoryObjection,
    deleteCategoryObjection,
  } = useStoreData();

  const [filterSlug, setFilterSlug] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [customSlug, setCustomSlug] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const slugOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const slug = p.categorySlug || slugify(p.category || '');
      if (slug) set.add(slug);
    });
    categoryObjections.forEach((o) => set.add(o.categorySlug));
    return [...set].sort();
  }, [products, categoryObjections]);

  const visible = useMemo(() => {
    const list = filterSlug
      ? categoryObjections.filter((o) => o.categorySlug === filterSlug)
      : categoryObjections;
    return [...list].sort((a, b) => {
      if (a.categorySlug < b.categorySlug) return -1;
      if (a.categorySlug > b.categorySlug) return 1;
      return a.orden - b.orden;
    });
  }, [categoryObjections, filterSlug]);

  const flash = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  const CUSTOM_SENTINEL = '__otro__';

  const isCustomSlug = (slug: string) =>
    slug !== '' && !slugOptions.includes(slug);

  useEffect(() => {
    if (form.categorySlug === CUSTOM_SENTINEL) {
      setForm((f) => ({ ...f, categorySlug: customSlug }));
    }
  }, [customSlug]);

  const openCreate = () => {
    const preSlug = filterSlug;
    setCustomSlug(isCustomSlug(preSlug) ? preSlug : '');
    setForm({ ...EMPTY_FORM, categorySlug: preSlug });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (obj: CategoryObjection) => {
    setCustomSlug(isCustomSlug(obj.categorySlug) ? obj.categorySlug : '');
    setForm({
      id: obj.id,
      categorySlug: obj.categorySlug,
      pregunta: obj.pregunta,
      respuesta: obj.respuesta,
      orden: obj.orden,
    });
    setEditingId(obj.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCustomSlug('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: CategoryObjection = {
        id: form.id.trim(),
        categorySlug: form.categorySlug.trim(),
        pregunta: form.pregunta.trim(),
        respuesta: form.respuesta.trim(),
        orden: form.orden,
      };
      if (editingId) {
        await updateCategoryObjection(payload);
        flash('success', 'Objeción actualizada correctamente.');
      } else {
        await addCategoryObjection(payload);
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
      await deleteCategoryObjection(deleteId);
      flash('success', 'Objeción eliminada.');
    } catch (err: any) {
      flash('error', err?.message || 'Error al eliminar.');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Tag className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Objeciones por Categoría</h1>
            <p className="text-sm text-zinc-400">Aplican a todos los productos de una categoría</p>
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

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterSlug('')}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filterSlug === ''
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 font-medium'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Todas
          </button>
          {slugOptions.map((slug) => (
            <button
              key={slug}
              onClick={() => setFilterSlug(slug)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filterSlug === slug
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 font-medium'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {slug}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">
              {editingId ? 'Editar objeción de categoría' : 'Nueva objeción de categoría'}
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
                  placeholder="manta"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Categoría <span className="text-rose-400">*</span>
                </label>
                <select
                  value={isCustomSlug(form.categorySlug) ? CUSTOM_SENTINEL : form.categorySlug}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === CUSTOM_SENTINEL) {
                      setForm((f) => ({ ...f, categorySlug: customSlug }));
                    } else {
                      setCustomSlug('');
                      setForm((f) => ({ ...f, categorySlug: val }));
                    }
                  }}
                  required={!isCustomSlug(form.categorySlug)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">— elegir categoría —</option>
                  {slugOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value={CUSTOM_SENTINEL}>Otra (escribir)</option>
                </select>
                {isCustomSlug(form.categorySlug) && (
                  <input
                    type="text"
                    value={customSlug}
                    onChange={(e) => {
                      setCustomSlug(e.target.value);
                      setForm((f) => ({ ...f, categorySlug: e.target.value }));
                    }}
                    required
                    autoFocus
                    placeholder="mi-categoria"
                    className="mt-2 w-full bg-zinc-800 border border-cyan-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Orden</label>
                <input
                  type="number"
                  value={form.orden}
                  onChange={(e) => setForm((f) => ({ ...f, orden: parseInt(e.target.value) || 1 }))}
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
                value={form.pregunta}
                onChange={(e) => setForm((f) => ({ ...f, pregunta: e.target.value }))}
                required
                placeholder="¿Incluye manta / pantalla?"
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
                placeholder="No necesita manta: una pared blanca y lisa funciona muy bien…"
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider w-10">Ord.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Pregunta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider hidden lg:table-cell">Respuesta</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500 text-sm">
                    {filterSlug
                      ? `No hay objeciones para la categoría "${filterSlug}".`
                      : 'No hay objeciones por categoría. Crea la primera con el botón de arriba.'}
                  </td>
                </tr>
              ) : (
                visible.map((obj) => (
                  <tr key={obj.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded-full border border-zinc-700">
                        <Tag className="w-3 h-3 text-cyan-500" />
                        {obj.categorySlug}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{obj.orden}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-zinc-800 text-cyan-400 px-2 py-0.5 rounded">
                        {obj.id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-200">{obj.pregunta}</td>
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
