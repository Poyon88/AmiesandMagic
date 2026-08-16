"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useNotificationStore } from "@/lib/store/notificationStore";

export default function NotificationBell() {
  const t = useTranslations("common");
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllRead } =
    useNotificationStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  /** Enchère visée par une notification, ou `null`.
   *
   *  Les cinq types d'enchère enregistrent déjà `auction_id` dans leurs
   *  metadata — aucune migration n'a été nécessaire, l'information dormait là.
   *  On la valide tout de même : une metadata est du JSON libre, et naviguer
   *  vers `/auction/undefined` afficherait une page d'erreur au lieu de ne rien
   *  faire. */
  function auctionIdOf(notif: { metadata?: Record<string, unknown> }): string | null {
    const id = notif.metadata?.auction_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  function handleClickNotif(id: string, isRead: boolean, auctionId: string | null) {
    if (!isRead) markAsRead([id]);
    if (auctionId) {
      // Le panneau se ferme AVANT la navigation : sinon il reste ouvert
      // par-dessus la page d'arrivée, la cloche n'ayant pas été cliquée.
      setOpen(false);
      router.push(`/auction/${auctionId}`);
    }
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
        title={t('notifications')}
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
            <span style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{t('notifications')}</span>
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
                {t('mark_all_read')}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#666", fontSize: 13 }}>
              {t('no_notifications')}
            </div>
          ) : (
            <div>
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleClickNotif(notif.id, notif.is_read, auctionIdOf(notif))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleClickNotif(notif.id, notif.is_read, auctionIdOf(notif));
                    }
                  }}
                  role="button"
                  tabIndex={0}
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
                      {/* Affichée SEULEMENT quand la notification mène quelque
                          part : toutes les lignes ont déjà `cursor: pointer`
                          pour se marquer comme lues, et promettre une
                          destination qui n'existe pas serait pire que rien. */}
                      {auctionIdOf(notif) && (
                        <div style={{ fontSize: 11, color: "#c8a84e", marginTop: 4, fontWeight: 600 }}>
                          {t('see_auction')} →
                        </div>
                      )}
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
