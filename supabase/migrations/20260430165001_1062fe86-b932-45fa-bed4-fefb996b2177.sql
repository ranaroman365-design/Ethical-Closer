SELECT cron.schedule(
  'dispatch-playbook-promotions-5m',
  '*/5 * * * *',
  $$
  select net.http_post(
    url:='https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/dispatch-playbook-promotions',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body:=concat('{"trigger":"cron","at":"', now(), '"}')::jsonb
  ) as request_id;
  $$
);