import { useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { useApp } from '@/store/app';
import { useLibrary } from '@/store/library';

/**
 * Features that write to the server — watch position, history, support
 * messages — are tied to a real account. Without one the server has nothing to
 * attach the data to, and the support inbox is open to anyone.
 */
export function useSignIn(): { signedIn: boolean; signIn: () => Promise<void>; busy: boolean } {
  const auth = useApp((s) => s.auth);
  const setSettings = useApp((s) => s.setSettings);
  const refreshIdentity = useApp((s) => s.refreshIdentity);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    const result = await window.zovex.auth.signIn();
    setBusy(false);
    if (result.ok && result.profile) {
      // The website keys a user by the bare Google `sub`; matching it is what
      // makes the desktop app show the same history as the site.
      await setSettings({ accountId: result.profile.sub });
      await refreshIdentity();
      const moved = await window.zovex.auth.migrateAccount();
      await useLibrary.getState().syncFromServer();
      if (moved.favorites || moved.history) {
        toast({
          title: 'הנתונים הישנים הועברו לחשבון',
          description: `${moved.favorites} מועדפים ו-${moved.history} פריטי היסטוריה.`,
          tone: 'success',
        });
      }
      toast({
        title: `שלום ${result.profile.name || result.profile.email}`,
        description: 'ההיסטוריה וההמשך צפייה של החשבון נטענים מהשרת.',
        tone: 'success',
      });
    } else {
      toast({ title: 'ההתחברות נכשלה', description: result.error, tone: 'danger', duration: 8000 });
    }
  };

  return { signedIn: Boolean(auth.profile), signIn, busy };
}

export function SignInGate({ title, text }: { title: string; text: string }) {
  const { signIn, busy } = useSignIn();
  return (
    <div className="state">
      <div className="state__icon"><ShieldCheck size={26} /></div>
      <h3 className="state__title">{title}</h3>
      <p className="state__text">{text}</p>
      <div className="state__actions">
        <Button variant="primary" size="lg" icon={<LogIn size={17} />} onClick={() => void signIn()} loading={busy}>
          התחבר עם Google
        </Button>
      </div>
    </div>
  );
}
