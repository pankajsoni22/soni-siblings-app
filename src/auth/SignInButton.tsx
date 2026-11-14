import { useEffect, useRef } from 'react';
import { getGsi } from './gsi.ts';
import { useAuth } from './useAuth.ts';

export default function SignInButton() {
  const ref = useRef<HTMLDivElement>(null);
  const { gsiReady } = useAuth();

  useEffect(() => {
    const gsi = getGsi();
    if (gsiReady && gsi && ref.current) {
      gsi.renderButton(ref.current, { type: 'standard', theme: 'filled_black', size: 'large', text: 'signin_with' });
    }
  }, [gsiReady]);

  return <div className="signin-button" ref={ref} />;
}
