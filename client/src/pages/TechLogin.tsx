import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Wrench } from 'lucide-react';

const STORAGE_KEY = 'hp_tech_name';

export default function TechLogin() {
  const [, nav] = useLocation();
  const [name, setName] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) nav('/tech/dashboard');
  }, []);

  const handleStart = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    nav('/tech/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: '#7A5D12' }}>
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Handy Pioneers</h1>
            <p className="text-sm text-gray-500 mt-1">Field Technician Portal</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder="e.g. Mike, Jose, Sarah"
              className="w-full border border-gray-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-yellow-600"
              autoFocus
            />
          </div>
          <button
            onClick={handleStart}
            disabled={!name.trim()}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-base transition-opacity disabled:opacity-40"
            style={{ background: '#7A5D12' }}
          >
            Start My Day →
          </button>
        </div>
      </div>
    </div>
  );
}
