'use strict';

(function initLAQPConsentMode() {
  var key = 'laqp_cookie_consent_v1';
  var consent = null;
  try {
    consent = JSON.parse(localStorage.getItem(key) || 'null');
  } catch {}

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    analytics_storage: consent && consent.analytics ? 'granted' : 'denied',
    ad_storage: consent && consent.ads ? 'granted' : 'denied',
    ad_user_data: consent && consent.ads ? 'granted' : 'denied',
    ad_personalization: consent && consent.ads ? 'granted' : 'denied',
    wait_for_update: 500,
  });
}());
