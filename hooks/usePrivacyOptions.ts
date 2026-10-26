/**
 * hooks/usePrivacyOptions.ts
 * For the "ad privacy choices" button on the Progress screens. `required` is true
 * only for users in the EU / UK / Switzerland (Google decides); for everyone else
 * the button must not be rendered at all.
 */
import { useCallback, useEffect, useState } from 'react';
import { openPrivacyOptions, privacyOptionsRequired } from '../services/adsConsent';

export function usePrivacyOptions() {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    let alive = true;
    privacyOptionsRequired().then(r => { if (alive) setRequired(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const open = useCallback(() => { openPrivacyOptions().catch(() => {}); }, []);
  return { required, open };
}
