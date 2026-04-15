"use client";

import { useState, useEffect, useRef } from "react";
import { useNotificationStore } from "@/lib/store/notificationStore";

export default function NotificationBell() {
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllRead } =
    useNotificationStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch on mount and poll every 30s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleOpen() {
    setOpen(!open);
    if (!open) fetchNotifications();
  }

  function handleClickNotif(id: string, isRead: boolean) {
    if (!isRead) markAsRead([id]);
  }

  const TYPE_ICONS: Record<string, string> = {
    auction_outbid: "⚠",
    auction_won: "🏆",
    auction_sold: "💰",
    auction_ended_unsold: "📦",
    auction_cancelled: "❌",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        style={{
          position: "relative",
          padding: "6px 10px",
          background: "transparent",
          border: "1px solid #3d3d5c",
          borderRadius: 8,
          color: "#e0e0e0",
          fontSize: 16,
          cursor: "pointer",
        }}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#e74c3c",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: "50%",
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            width: 340,
            maxHeight: 400,
            overflow: "auto",
            background: "#1a1a2e",
            border: "1px solid #3d3d5c",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              borderBottom: "1px solid #3d3d5c",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                style={{
                  background: "none",
                  border: "none",
                  color: "#c8a84e",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#666", fontSize: 13 }}>
              Aucune notification
            </div>
          ) : (
            <div>
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleClickNotif(notif.id, notif.is_read)}
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid #3d3d5c22",
                    background: notif.is_read ? "transparent" : "#c8a84e08",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
                    <span style={{ fontSize: 14 }}>{TYPE_ICONS[notif.type] ?? "📌"}</span>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: notif.is_read ? 400 : 600,
                          color: notif.is_read ? "#999" : "#e0e0e0",
                        }}
                      >
                        {notif.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                        {notif.message}
                      </div>
                      <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
                        {new Date(notif.created_at).toLocaleString("fr-FR")}
                      </div>
                    </div>
                    {!notif.is_read && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#c8a84e",
                          flexShrink: 0,
                          marginTop: 4,
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
