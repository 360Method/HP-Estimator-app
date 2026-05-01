declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export function installAnalytics() {
  const ga4MeasurementId = import.meta.env.VITE_GA4_MEASUREMENT_ID;
  if (ga4MeasurementId) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args: any[]) => window.dataLayer?.push(args);
    window.gtag("js", new Date());
    window.gtag("config", ga4MeasurementId, { send_page_view: false });
  }

  const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
  if (analyticsEndpoint && analyticsWebsiteId) {
    const script = document.createElement("script");
    script.defer = true;
    script.src = `${analyticsEndpoint.replace(/\/$/, "")}/umami`;
    script.dataset.websiteId = analyticsWebsiteId;
    document.body.appendChild(script);
  }
}
