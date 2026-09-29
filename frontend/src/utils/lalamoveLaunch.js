export const getLalamoveLaunchUrl = (launch = {}, tracking = {}) => {
  // Generic app links open a new order form, not the delivery just booked.
  const candidate = launch?.shareLink
    || launch?.launchUrls?.web
    || tracking?.shareLink
    || '';
  if (!candidate) return '';

  try {
    // Keep the courier's URL intact; delivery details are sent by the booking API.
    return new URL(candidate).protocol === 'https:' ? candidate : '';
  } catch {
    return '';
  }
};

export const closeLalamoveWindow = (bookingWindow) => {
  try {
    if (bookingWindow && !bookingWindow.closed) bookingWindow.close();
  } catch {
    // A browser can revoke access after the user closes or navigates the tab.
  }
};

export const reserveLalamoveWindow = (browserWindow = globalThis.window) => {
  let bookingWindow;
  try {
    // This must run during the click, before awaiting the booking request.
    bookingWindow = browserWindow?.open('about:blank', '_blank');
    if (!bookingWindow) return null;
    bookingWindow.opener = null;
    const doc = bookingWindow.document;
    if (doc?.body) {
      doc.title = 'Booking Delivery | V&G Lecheflan';
      doc.documentElement.lang = 'en';
      const viewport = doc.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1';
      const style = doc.createElement('style');
      style.textContent = `
        body { margin: 0; min-height: 100vh; display: grid; place-items: center;
          background: #fff8ef; color: #14243b; font-family: system-ui, sans-serif; }
        main { box-sizing: border-box; width: min(480px, calc(100% - 32px)); padding: 32px;
          background: white; border-radius: 20px; box-shadow: 0 12px 40px #14243b12; }
        h1 { margin: 12px 0; font-size: 26px; }
        p { line-height: 1.6; }
        .brand { color: #d94700; font-weight: 700; }
        button { padding: 12px 20px; border: 0; border-radius: 10px; background: #e65000;
          color: white; font: inherit; font-weight: 700; cursor: pointer; }
      `;
      const card = doc.createElement('main');
      const brand = doc.createElement('div');
      brand.className = 'brand';
      brand.textContent = 'V&G Lecheflan';
      const title = doc.createElement('h1');
      title.textContent = 'Booking your delivery…';
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = 'Waiting for the delivery service to confirm. Tracking will open here when your booking is confirmed.';
      const help = doc.createElement('p');
      help.textContent = 'You can return to Orders to check progress. Please wait for the result before trying again.';
      const back = doc.createElement('button');
      back.type = 'button';
      back.textContent = 'Return to Orders';
      back.addEventListener('click', () => {
        browserWindow.focus?.();
        closeLalamoveWindow(bookingWindow);
      });
      card.append(brand, title, status, help, back);
      doc.head.append(viewport, style);
      doc.body.replaceChildren(card);
    }
    return bookingWindow;
  } catch {
    closeLalamoveWindow(bookingWindow);
    return null;
  }
};

export const openLalamoveBooking = (bookingWindow, url) => {
  try {
    if (!bookingWindow || bookingWindow.closed || !getLalamoveLaunchUrl({ shareLink: url })) {
      closeLalamoveWindow(bookingWindow);
      return false;
    }

    bookingWindow.location.replace(url);
    return true;
  } catch {
    closeLalamoveWindow(bookingWindow);
    return false;
  }
};
