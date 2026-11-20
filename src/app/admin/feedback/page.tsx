import FeedbackManager from "@/components/admin/FeedbackManager";

export const metadata = { title: "Retours joueurs — Admin | Armies of Legends" };

// L'accès est réservé aux admins par le layout (`requireAdminPage`) ; les
// données viennent de /api/admin/feedback, qui le revérifie.
export default function AdminFeedbackPage() {
  return (
    <div style={{ minHeight: "100%", background: "#f5f5f5" }}>
      <FeedbackManager />
    </div>
  );
}
