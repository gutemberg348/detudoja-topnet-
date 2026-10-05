import { useEffect, useRef, useState } from "react";
import { getInitialPushNotificationData, subscribePushNotificationResponses } from "../services/push-notifications";
import { notificationTarget } from "../utils/notification-target";

export function usePushNavigation({ navigationRef, session, activeRouteName }) {
  const [pending, setPending] = useState(null);
  const handled = useRef(new Set());
  useEffect(() => {
    let active = true;
    const receive = response => { if (active && response && !handled.current.has(response.id)) setPending(response); };
    const listener = subscribePushNotificationResponses(receive);
    getInitialPushNotificationData().then(receive).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (!pending || !session?.user?.id || !navigationRef.isReady() || !activeRouteName
      || !navigationRef.getRootState()?.routeNames?.includes("Main")) return;
    const target = notificationTarget(pending.data, session.user.id);
    handled.current.add(pending.id);
    if (handled.current.size > 100) handled.current.delete(handled.current.values().next().value);
    setPending(null);
    if (target) navigationRef.navigate(target.screen, target.params);
  }, [pending, session?.user?.id, activeRouteName, navigationRef]);
}
