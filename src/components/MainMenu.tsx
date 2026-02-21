"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface MainMenuProps {
  username: string;
}

export default function MainMenu({ username }: MainMenuProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const menuItems = [
    {
      label: "Play",
      description: "Find an opponent and battle",
      href: "/play",
      color: "bg-accent hover:bg-accent/80",
    },
    {
      label: "My Decks",
      description: "Build and manage your decks",
      href: "/decks",
      color: "bg-primary hover:bg-primary-dark",
    },
    {
      label: "Collection",
      description: "Browse all available cards",
      href: "/collection",
      color: "bg-mana-blue hover:bg-mana-blue/80",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* Header */}
      <div className="absolute top-6 right-6 flex items-center gap-4">
        <span className="text-foreground/60 text-sm">
          Welcome, <span className="text-primary font-medium">{username}</span>
        </span>
        <button
          onClick={handleLogout}
          className="px-4 py-1.5 text-sm bg-secondary border border-card-border rounded-lg text-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Title */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-primary mb-3">
          Armies & Magic
        </h1>
        <p className="text-foreground/50 text-lg">
          A fantasy collectible card game
        </p>
      </div>

      {/* Menu buttons */}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        {menuItems.map((item) => (
          <button
            key={item.label}
            onClick={() => router.push(item.href)}
            className={`${item.color} text-white py-4 px-6 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] shadow-lg`}
          >
            <div>{item.label}</div>
            <div className="text-xs font-normal opacity-80 mt-0.5">
              {item.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
