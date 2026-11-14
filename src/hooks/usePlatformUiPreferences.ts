import { useEffect, useState } from 'react';
import { apiRequest, hasSession, subscribeSessionChange } from '@/services/auth';

const defaults = {
  'platform.notification.poll_seconds': 60,
  'platform.factory.poll_seconds': 3,
  'platform.home.poll_seconds': 5,
} as const;
type Preference = keyof typeof defaults;
const bounds: Record<Preference, [number, number]> = {
  'platform.notification.poll_seconds': [15, 600],
  'platform.factory.poll_seconds': [2, 60],
  'platform.home.poll_seconds': [2, 60],
};

/** 读取非敏感的白名单参数；断网或后端未升级时使用内置默认值。 */
export default function usePlatformUiPreference(key: Preference): number {
  const [seconds, setSeconds] = useState<number>(defaults[key]);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const load = () => {
      const current = ++generation;
      if (!hasSession()) {
        setSeconds(defaults[key]);
        return;
      }
      void apiRequest<Partial<Record<Preference, number>>>('/api/current/ui-preferences')
        .then((values) => {
          if (!active || current !== generation) return;
          const value = values[key];
          const [min, max] = bounds[key];
          setSeconds(
            typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
              ? value
              : defaults[key],
          );
        })
        .catch(() => {
          if (active && current === generation) setSeconds(defaults[key]);
        });
    };
    load();
    const unsubscribe = subscribeSessionChange(load);
    const timer = window.setInterval(load, 60_000);
    return () => {
      active = false;
      generation++;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [key]);
  return seconds;
}
