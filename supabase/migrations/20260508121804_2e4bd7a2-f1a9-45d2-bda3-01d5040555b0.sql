create table if not exists public.commission_rates (
  id bigserial primary key,
  level int not null,
  role_label text not null,
  business_stages text[] not null,
  revenue_commission_pct numeric(5,2) not null,
  override_pct numeric(5,2) not null default 0,
  override_on_levels int[] not null default '{}',
  override_scope text not null default 'direct_only',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_rates_override_scope_check
    check (override_scope in ('direct_only','same_unit','subtree','global'))
);

create unique index if not exists idx_commission_rates_level_role
  on public.commission_rates(level, role_label);

create index if not exists idx_commission_rates_business_stages
  on public.commission_rates using gin (business_stages);

create index if not exists idx_commission_rates_active
  on public.commission_rates(is_active);

create or replace function public.commission_rates_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_commission_rates_updated_at on public.commission_rates;
create trigger trg_commission_rates_updated_at
  before update on public.commission_rates
  for each row execute function public.commission_rates_set_updated_at();

insert into public.commission_rates
  (level, role_label, business_stages, revenue_commission_pct, override_pct, override_on_levels, override_scope)
values
  (1, 'Opener / Trainee',         ARRAY['trainee','opener'],                                  1.00, 0,    ARRAY[]::int[],         'direct_only'),
  (2, 'Associate Setter',         ARRAY['associate','associate_setter','setter'],             3.00, 0,    ARRAY[]::int[],         'direct_only'),
  (3, 'Senior Setter',            ARRAY['senior_setter','senior_associate'],                  5.00, 0,    ARRAY[]::int[],         'direct_only'),
  (4, 'Junior Closer',            ARRAY['junior_manager'],                                    8.00, 0,    ARRAY[]::int[],         'direct_only'),
  (5, 'Managing Closer',          ARRAY['manager'],                                          10.00, 0,    ARRAY[]::int[],         'direct_only'),
  (6, 'Senior Closer / Operator', ARRAY['senior_manager'],                                   12.00, 2.00, ARRAY[4,5],             'same_unit'),
  (7, 'Director',                 ARRAY['director'],                                         12.00, 3.00, ARRAY[4,5,6],           'subtree'),
  (8, 'Partner',                  ARRAY['partner'],                                          12.00, 3.00, ARRAY[4,5,6,7],         'global')
on conflict (level, role_label) do nothing;

comment on table public.commission_rates is 'Canonical compensation matrix (L1-L8). Read-only canonical source. Application layer resolves overrides; SQL never auto-applies overrides.';