import React, { useState } from 'react';
import { Lock, UserCheck, ShieldAlert, X } from 'lucide-react';
import { ActiveUser } from '../types';

interface SwitchUserModalProps {
  isOpen: boolean;
  currentUser: ActiveUser;
  targetUser: 'Pranjal' | 'Shubham';
  onClose: () => void;
  onSuccess: (newUser: 'Pranjal' | 'Shubham') => void;
}

export const SwitchUserModal: React.FC<SwitchUserModalProps> = ({
  isOpen,
  currentUser,
  targetUser,
  onClose,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePinChange = (val: string) => {
    // Only allow digits
    const cleaned = val.replace(/\D/g, '').slice(0, 4);
    setPin(cleaned);
    if (error) setError(null);

    // Auto submit upon entering 4 digits for seamless UX
    if (cleaned.length === 4) {
      if (cleaned === '1234') {
        setError(null);
        setPin('');
        onSuccess(targetUser);
      } else {
        setError('Incorrect PIN. Enter 1234 to switch.');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') {
      setError(null);
      setPin('');
      onSuccess(targetUser);
    } else {
      setError('Incorrect passcode. Enter 1234 to switch.');
      setPin('');
    }
  };

  return (
    <div
      id="switch-user-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in"
    >
      <div
        id="switch-user-modal-card"
        className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl"
      >
        <button
          id="close-switch-user-modal"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20 mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Switch Profile</h3>
          <p className="mt-1 text-xs text-slate-400">
            Switching from <span className="font-semibold text-slate-200">{currentUser}</span> to{' '}
            <span className="font-semibold text-cyan-400">{targetUser}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 text-center">
              Enter Passcode
            </label>
            <input
              id="switch-user-pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="••••"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-2xl font-mono tracking-widest text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
            />
          </div>

          {error && (
            <div
              id="switch-user-error"
              className="flex items-center gap-2 rounded-xl border border-rose-800/60 bg-rose-950/40 p-2.5 text-xs text-rose-300"
            >
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              id="cancel-switch-user-btn"
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              id="confirm-switch-user-btn"
              type="submit"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-cyan-900/30 hover:bg-cyan-500 transition"
            >
              <UserCheck className="w-4 h-4" />
              <span>Unlock & Switch</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
