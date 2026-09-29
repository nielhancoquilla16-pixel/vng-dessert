-- Preserve every saved setting. Closing before opening means the next day;
-- identical times remain invalid rather than implying a 24-hour shop.
begin;

alter table public.shop_settings drop constraint if exists shop_settings_check;
alter table public.shop_settings drop constraint if exists shop_settings_operating_hours_check;
alter table public.shop_settings
  add constraint shop_settings_operating_hours_check
  check (opening_time <> closing_time);

comment on column public.shop_settings.closing_time is
  'Asia/Manila local time. A time before opening_time closes on the next calendar date; 00:00 is midnight at the end of the operating day.';

commit;
