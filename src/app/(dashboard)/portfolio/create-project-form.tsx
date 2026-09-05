'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '@/server/actions/projects';

export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [commercialModel, setCommercialModel] = useState<'FF' | 'TM'>('FF');
  const [methodology, setMethodology] = useState<'WATERFALL' | 'AGILE' | 'HYBRID'>('WATERFALL');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await createProject({ name, client, commercialModel, methodology });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName('');
      setClient('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
      <label className="flex flex-col gap-1.5 lg:col-span-2">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Project name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Client</span>
        <input className="input" value={client} onChange={(e) => setClient(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Commercial model</span>
        <select className="input" value={commercialModel} onChange={(e) => setCommercialModel(e.target.value as 'FF' | 'TM')}>
          <option value="FF">Fixed Fee</option>
          <option value="TM">Time &amp; Materials</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Methodology</span>
        <select
          className="input"
          value={methodology}
          onChange={(e) => setMethodology(e.target.value as 'WATERFALL' | 'AGILE' | 'HYBRID')}
        >
          <option value="WATERFALL">Waterfall</option>
          <option value="AGILE">Agile</option>
          <option value="HYBRID">Hybrid</option>
        </select>
      </label>
      <div className="lg:col-span-5 flex items-center gap-3">
        <button type="submit" disabled={submitting} className="btn-primary !w-auto px-6">
          {submitting ? 'Registering…' : 'Register engagement'}
        </button>
        {error && <span className="text-critical text-sm">{error}</span>}
      </div>
    </form>
  );
}
