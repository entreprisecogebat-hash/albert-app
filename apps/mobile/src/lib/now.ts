import { useEffect, useState } from 'react';

/** Horloge qui avance toutes les 30 secondes, seulement quand on en a besoin (pointage en cours). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const h = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(h);
  }, [active]);
  return now;
}
