/**
 * Layer 44 client helper — Web Push subscription registration.
 * Call requestPushSubscription() after the user explicitly opts in (e.g. button click).
 * Never auto-prompt on page load.
 */
import { supabase } from '@/integrations/supabase/client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export type PushOptInResult =
  | { status: 'subscribed' }
  | { status: 'permission_denied' }
  | { status: 'unsupported' }
  | { status: 'no_vapid_key' }
  | { status: 'error'; error: string };

export async function isPushSupported(): Promise<boolean> {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function requestPushSubscription(): Promise<PushOptInResult> {
  try {
    if (!(await isPushSupported())) return { status: 'unsupported' };

    const { data: settings } = await supabase
      .from('push_settings')
      .select('vapid_public_key, master_enabled')
      .eq('id', true)
      .maybeSingle();

    if (!settings?.vapid_public_key) return { status: 'no_vapid_key' };

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { status: 'permission_denied' };

    const reg = await navigator.serviceWorker.register('/push-sw.js');
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(settings.vapid_public_key).buffer as ArrayBuffer,
      });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { status: 'error', error: 'not_authenticated' };

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const endpoint = json.endpoint ?? sub.endpoint;
    const p256dh = json.keys?.p256dh
      ?? arrayBufferToBase64(sub.getKey('p256dh') as ArrayBuffer | null);
    const authSecret = json.keys?.auth
      ?? arrayBufferToBase64(sub.getKey('auth') as ArrayBuffer | null);

    if (!endpoint || !p256dh || !authSecret) {
      return { status: 'error', error: 'incomplete_subscription' };
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth_secret: authSecret,
          user_agent: navigator.userAgent,
          revoked_at: null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' },
      );

    if (error) return { status: 'error', error: error.message };
    return { status: 'subscribed' };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}

export async function revokePushSubscription(): Promise<void> {
  if (!(await isPushSupported())) return;
  const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('push_subscriptions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('endpoint', sub.endpoint);
    }
  }
}
