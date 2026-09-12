import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import type { Hold } from '../../types/domain';

export function HoldCountdown({ hold, receivedAt, onExpire }: { hold: Hold; receivedAt: number; onExpire: () => void }) {
  const [now, setNow] = useState(Date.now()); const expired = useRef(false);
  const seconds = Math.max(0, Math.ceil((Date.parse(hold.expires_at) - Date.parse(hold.server_now) - (now - receivedAt)) / 1000));
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => { if (seconds === 0 && !expired.current) { expired.current = true; onExpire(); } }, [seconds, onExpire]);
  return <div className={`hold-banner ${seconds < 60 ? 'hold-urgent' : ''}`} role="status"><Timer size={21} /><span>Este carril está reservado temporalmente para ti.<strong>{Math.floor(seconds / 60).toString().padStart(2, '0')}:{(seconds % 60).toString().padStart(2, '0')}</strong></span></div>;
}
