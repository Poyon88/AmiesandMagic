import { create } from 'zustand';
import type { Notification } from '@/lib/auction/types';

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;

  fetchNotifications: () => Promise<void>;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (!res.ok) return;
      const data = await res.json();
      set({
        notifications: data.notifications ?? [],
        unreadCount: data.unread_count ?? 0,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  markAsRead: async (ids: string[]) => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const notifications = get().notifications.map((n) =>
      ids.includes(n.id) ? { ...n, is_read: true } : n
    );
    const unreadCount = notifications.filter((n) => !n.is_read).length;
    set({ notifications, unreadCount });
  },

  markAllRead: async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    set({
      notifications: get().notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    });
  },
}));
