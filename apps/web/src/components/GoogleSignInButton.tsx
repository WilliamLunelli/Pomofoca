import { useEffect, useRef, useState } from 'react';

import { renderGoogleButton } from '@/lib/googleAuth';

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  onError?: (message: string) => void;
}

export function GoogleSignInButton({ onCredential, onError }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    renderGoogleButton(container, onCredential).catch((err) => {
      setFailed(true);
      onError?.(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar o login com Google.',
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
