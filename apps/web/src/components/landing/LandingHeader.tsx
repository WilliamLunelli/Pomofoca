import { useEffect, useRef, useState } from 'react';
import { Timer as TimerIcon } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

interface LandingHeaderProps {
  loggedIn: boolean;
}

/**
 * Cabecalho fixo de uma linha. Ganha borda inferior quando a pagina rola; detecta
 * isso com um sentinel no topo (IntersectionObserver), sem listener de scroll.
 */
export function LandingHeader({ loggedIn }: LandingHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      setScrolled(!entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="absolute left-0 top-0 h-px w-px" />
      <header
        className="landing-header fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between px-6 md:px-12"
        data-scrolled={scrolled}
      >
        <Link to="/" className="flex items-center gap-2">
          <TimerIcon weight="fill" size={20} className="text-accent" />
          <span className="font-heading text-lg tracking-tight">Pomofoca</span>
        </Link>
        <nav className="flex items-center gap-2">
          {loggedIn ? (
            <Link to="/timer" className="btn btn-secondary">
              Abrir o timer
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                Entrar
              </Link>
              <Link to="/register" className="btn btn-primary">
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </header>
    </>
  );
}
