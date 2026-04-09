import { create } from 'zustand';

interface WalletStore {
  balance: number | null;
  loading: boolean;
  error: string | null;

  fetchBalance: () => Promise<void>;
  setBalance: (balance: number) => void;
  reset: () => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  balance: null,
  loading: false,
  error: null,

  fetchBalance: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/wallet');
      if (!res.ok) throw new Error('Erreur lors du chargement du solde');
      const data = await res.json();
      set({ balance: data.balance, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  setBalance: (balance: number) => set({ balance }),

  reset: () => set({ balance: null, loading: false, error: null }),
}));
