import React, { useEffect, useState } from 'react';
import {
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { School } from '@/src/types';
import { Plus, Edit2, Trash2, X, Building2, MapPin, Navigation, Crosshair } from 'lucide-react';

const DEFAULT_RADIUS = 500;

const emptyForm = {
  name: '',
  address: '',
  defaultStartTime: '08:00',
  defaultEndTime: '17:00',
  latitude: '',
  longitude: '',
  geoRadius: String(DEFAULT_RADIUS),
};

type FormState = typeof emptyForm;

export function AdminEscolas() {
  const { profile: adminProfile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'schools'),
      (snap) => {
        setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() } as School)));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'schools'),
    );
    return () => unsub();
  }, []);

  const openCreate = () => {
    setEditingSchool(null);
    setFormData(emptyForm);
    setLocError('');
    setIsModalOpen(true);
  };

  const openEdit = (school: School) => {
    setEditingSchool(school);
    setFormData({
      name: school.name,
      address: school.address,
      defaultStartTime: school.defaultStartTime ?? '08:00',
      defaultEndTime: school.defaultEndTime ?? '17:00',
      latitude: school.location ? String(school.location.latitude) : '',
      longitude: school.location ? String(school.location.longitude) : '',
      geoRadius: String(school.geoRadius ?? DEFAULT_RADIUS),
    });
    setLocError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSchool(null);
  };

  const captureLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocError('Geolocalização não suportada neste navegador.');
      return;
    }
    setLocating(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({
          ...prev,
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        }));
        setLocating(false);
      },
      (err) => {
        setLocError(`Erro ao obter localização: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setSaving(true);
    try {
      const locationData =
        formData.latitude && formData.longitude
          ? { latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude) }
          : undefined;

      const payload: Omit<School, 'id'> = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        defaultStartTime: formData.defaultStartTime,
        defaultEndTime: formData.defaultEndTime,
        location: locationData,
        geoRadius: formData.geoRadius ? parseInt(formData.geoRadius) : DEFAULT_RADIUS,
      };

      if (editingSchool?.id) {
        await updateDoc(doc(db, 'schools', editingSchool.id), payload as Record<string, unknown>);
      } else {
        await addDoc(collection(db, 'schools'), payload);
      }
      closeModal();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'schools');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (school: School) => {
    if (!school.id) return;
    if (!confirm(`Excluir escola "${school.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'schools', school.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'schools');
    }
  };

  const field = (key: keyof FormState) => ({
    value: formData[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormData(prev => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Building2 size={24} /> Escolas
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Gerencie as unidades escolares e configure a geolocalização para controle de ponto.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} /> Nova Escola
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Carregando...</div>
          ) : schools.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Nenhuma escola cadastrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">Nome</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">Endereço</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">Turno padrão</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">Geolocalização</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">Raio</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {schools.map(school => (
                    <tr key={school.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{school.name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{school.address}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {school.defaultStartTime ?? '--'} – {school.defaultEndTime ?? '--'}
                      </td>
                      <td className="px-4 py-3">
                        {school.location ? (
                          <a
                            href={`https://www.google.com/maps?q=${school.location.latitude},${school.location.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <MapPin size={14} />
                            {school.location.latitude.toFixed(5)}, {school.location.longitude.toFixed(5)}
                          </a>
                        ) : (
                          <span className="text-slate-400 italic">Não definida</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {school.geoRadius ?? DEFAULT_RADIUS} m
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => openEdit(school)}
                            className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600"
                            title="Editar"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(school)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {editingSchool ? 'Editar Escola' : 'Nova Escola'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome da Escola *
                </label>
                <Input {...field('name')} required placeholder="Ex: Escola Municipal Castelo Branco" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Endereço *
                </label>
                <Input {...field('address')} required placeholder="Rua, número, bairro, cidade" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Início do turno
                  </label>
                  <Input type="time" {...field('defaultStartTime')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Fim do turno
                  </label>
                  <Input type="time" {...field('defaultEndTime')} />
                </div>
              </div>

              {/* Geolocation */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Navigation size={14} /> Geolocalização
                  </p>
                  <button
                    type="button"
                    onClick={captureLocation}
                    disabled={locating}
                    className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    <Crosshair size={12} />
                    {locating ? 'Capturando...' : 'Capturar minha localização'}
                  </button>
                </div>
                {locError && <p className="text-xs text-red-500">{locError}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Latitude
                    </label>
                    <Input
                      {...field('latitude')}
                      placeholder="-23.5505"
                      type="number"
                      step="any"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Longitude
                    </label>
                    <Input
                      {...field('longitude')}
                      placeholder="-46.6333"
                      type="number"
                      step="any"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Raio permitido (metros)
                  </label>
                  <Input
                    {...field('geoRadius')}
                    type="number"
                    min="50"
                    max="5000"
                    step="50"
                    placeholder="500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Distância máxima da escola para bater o ponto. Padrão: 500 m.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Salvando...' : editingSchool ? 'Atualizar' : 'Criar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
