import { ReactNode, useEffect, useState } from "react";
import { Navigation } from "./Navigation";

interface LayoutProps {
  children: ReactNode;
  backgroundImage?: string;
}

export const Layout = ({ children, backgroundImage }: LayoutProps) => {
  const [resolvedBackground, setResolvedBackground] = useState<string | null>(null);

  useEffect(() => {
    const candidate = backgroundImage?.trim();

    if (!candidate) {
      setResolvedBackground(null);
      return;
    }

    let isMounted = true;
    setResolvedBackground(null);

    const img = new Image();
    img.src = candidate;
    img.onload = () => {
      if (isMounted) {
        setResolvedBackground(candidate);
      }
    };
    img.onerror = () => {
      if (isMounted) {
        setResolvedBackground(null);
      }
    };

    return () => {
      isMounted = false;
    };
  }, [backgroundImage]);

  const backgroundStyle = resolvedBackground
    ? {
        backgroundImage: `url(${resolvedBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, hsl(210 60% 70%), hsl(195 70% 75%))",
        backgroundSize: "cover",
        backgroundPosition: "center",
      };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background with user profile photo or gradient */}
      <div 
        className="fixed inset-0 z-0"
        style={backgroundStyle}
      >
        <div className="absolute inset-0 backdrop-blur-3xl bg-background/40" />
      </div>

      {/* Animated glow effects */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-glow-pulse" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: '1.5s' }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen pb-20">
        <main className="flex-1 p-4 animate-fade-in">
          {children}
        </main>
        
        {/* Bottom Navigation */}
        <Navigation />
      </div>
    </div>
  );
};
