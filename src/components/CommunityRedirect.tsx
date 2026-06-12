import { useEffect } from "react";

/**
 * Hard redirect: every legacy /community*, /members/community*, /admin/community*
 * route is forwarded to the Global Closer Network (affiliate partner).
 *
 * Same-tab navigation, with UTMs preserved for attribution.
 */
const GLOBAL_CLOSER_URL =
  "https://joinglobalcloser.com/?utm_source=etc&utm_medium=platform&utm_campaign=community_redirect";

export default function CommunityRedirect() {
  useEffect(() => {
    window.location.replace(GLOBAL_CLOSER_URL);
  }, []);
  return null;
}
