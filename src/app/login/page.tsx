import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

// Le formulaire lit `?error=` (posé par /auth/callback) via `useSearchParams`,
// ce qui impose une frontière de Suspense : sans elle, Next bascule toute la
// page en rendu client au build.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
