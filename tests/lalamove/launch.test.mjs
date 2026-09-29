import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeLalamoveWindow,
  getLalamoveLaunchUrl,
  openLalamoveBooking,
  reserveLalamoveWindow,
} from '../../frontend/src/utils/lalamoveLaunch.js';

const createBookingWindow = () => ({
  opener: { location: 'dashboard' },
  closed: false,
  close() { this.closed = true; },
  location: { replace(url) { this.url = url; } },
});

test('reserves a tab before the request and detaches its opener', async () => {
  const events = [];
  const tab = createBookingWindow();
  const reserved = reserveLalamoveWindow({
    open(url, target) {
      events.push('open');
      assert.equal(url, 'about:blank');
      assert.equal(target, '_blank');
      return tab;
    },
  });

  assert.equal(tab.opener, null);
  const shareLink = await Promise.resolve().then(() => {
    events.push('booking response');
    return 'https://share.lalamove.com/order?signature=a%2Fb%3D&token=x+y';
  });
  assert.equal(openLalamoveBooking(reserved, shareLink), true);
  assert.equal(tab.location.url, shareLink);
  assert.deepEqual(events, ['open', 'booking response']);
});

test('a blocked popup leaves the tracking link usable without navigating the dashboard', () => {
  const browserWindow = {
    open: () => null,
    location: { assign() { assert.fail('must not replace the dashboard'); } },
  };
  const tab = reserveLalamoveWindow(browserWindow);
  const shareLink = getLalamoveLaunchUrl({
    launchUrls: { web: 'https://share.lalamove.com/order/123' },
  });
  assert.equal(openLalamoveBooking(tab, shareLink), false);
  assert.equal(shareLink, 'https://share.lalamove.com/order/123');
});

test('a successful booking without a share link closes the placeholder tab', () => {
  const tab = createBookingWindow();
  assert.equal(getLalamoveLaunchUrl({ mode: 'delivery-api', orderId: '123' }), '');
  assert.equal(openLalamoveBooking(tab, ''), false);
  assert.equal(tab.closed, true);
  assert.equal(tab.location.url, undefined);
});

test('a failed booking can close its reserved tab safely', () => {
  const tab = createBookingWindow();
  closeLalamoveWindow(tab);
  assert.equal(tab.closed, true);
  assert.doesNotThrow(() => closeLalamoveWindow(null));
  assert.doesNotThrow(() => closeLalamoveWindow(tab));
});

test('a closed or inaccessible tab cannot turn booking success into a retry', () => {
  const tab = createBookingWindow();
  tab.closed = true;
  assert.equal(openLalamoveBooking(tab, 'https://share.lalamove.com/123'), false);
  assert.equal(tab.location.url, undefined);

  const inaccessible = createBookingWindow();
  inaccessible.location.replace = () => { throw new Error('Access denied'); };
  assert.equal(openLalamoveBooking(inaccessible, 'https://share.lalamove.com/123'), false);
  assert.equal(inaccessible.closed, true);
});

test('opens the booked delivery instead of the generic Lalamove app', () => {
  const shareLink = 'https://share.lalamove.com/order/123?signature=original%2Fvalue';
  const appLink = 'https://lalamove.onelink.me/MgeC?af_dp=lalamove%3A%2F%2Fopen';
  assert.equal(getLalamoveLaunchUrl({ launchUrls: { app: appLink }, shareLink }, { shareLink }), shareLink);
  assert.equal(getLalamoveLaunchUrl({ launchUrls: { app: appLink, web: shareLink } }), shareLink);
  assert.equal(getLalamoveLaunchUrl({ launchUrls: { app: appLink } }, { shareLink }), shareLink);
  assert.equal(getLalamoveLaunchUrl({ mode: 'delivery-api', orderId: '123', launchUrls: { app: appLink } }), '');
  assert.equal(getLalamoveLaunchUrl({}, { shareLink }), shareLink);
});

test('rejects script, relative, and invented app links', () => {
  assert.equal(getLalamoveLaunchUrl({ launchUrls: { app: 'lalamove://booking?customer=Test' } }), '');
  assert.equal(getLalamoveLaunchUrl({ shareLink: 'javascript:alert(1)' }), '');
  assert.equal(getLalamoveLaunchUrl({ shareLink: '/somewhere' }), '');
});
