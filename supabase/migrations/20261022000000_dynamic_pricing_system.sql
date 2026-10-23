-- ====================================================================
-- Dynamic Pricing & Financial Profitability Engine Migration
-- ====================================================================

-- 1. Financial & Pricing Settings
create table if not exists public.pricing_settings (
    id text primary key default 'default',
    setup_fee numeric(10,2) not null default 25.00,
    printing_hourly_rate numeric(10,2) not null default 12.00,
    pickup_minimum numeric(10,2) not null default 75.00,
    shipping_minimum numeric(10,2) not null default 150.00,
    packaging_fee numeric(10,2) not null default 25.00,
    actual_packaging_cost numeric(10,2) not null default 10.00,
    electricity_hourly_rate numeric(10,2) not null default 0.00,
    maintenance_hourly_rate numeric(10,2) not null default 5.00,
    depreciation_hourly_rate numeric(10,2) not null default 4.50,
    failed_print_reserve_pct numeric(5,4) not null default 0.0800,
    deposit_percentage numeric(5,4) not null default 0.5000,
    referral_commission_pct numeric(5,4) not null default 0.0500,
    monthly_fixed_overhead numeric(10,2) not null default 0.00,
    partner_a_ownership numeric(5,4) not null default 0.5000,
    partner_b_ownership numeric(5,4) not null default 0.5000,
    distributable_pool_pct numeric(5,4) not null default 0.4000,
    growth_pool_pct numeric(5,4) not null default 0.4000,
    reserve_pool_pct numeric(5,4) not null default 0.2000,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed singleton row if not exists
insert into public.pricing_settings (id)
values ('default')
on conflict (id) do nothing;

-- 2. Material Rates & Purchase Costs
create table if not exists public.material_rates (
    id uuid primary key default gen_random_uuid(),
    material_key text unique not null,
    display_name text not null,
    selling_rate_per_gram numeric(10,2) not null,
    cost_per_gram numeric(10,2) not null,
    is_active boolean default true,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into public.material_rates (material_key, display_name, selling_rate_per_gram, cost_per_gram) values
('pla', 'PLA', 1.80, 0.65),
('pla_plus', 'PLA+ / Rapid PLA', 2.00, 0.75),
('petg', 'PETG', 2.10, 0.70),
('tpu', 'TPU', 2.70, 0.95),
('carbon_fiber', 'Carbon Fiber Filled', 3.50, 1.35)
on conflict (material_key) do update set
    selling_rate_per_gram = excluded.selling_rate_per_gram,
    cost_per_gram = excluded.cost_per_gram;

-- 3. Shipping Zones
create table if not exists public.shipping_zones (
    id uuid primary key default gen_random_uuid(),
    zone_name text unique not null,
    estimated_cost numeric(10,2) not null,
    is_active boolean default true
);

insert into public.shipping_zones (zone_name, estimated_cost) values
('Alexandria', 55.00),
('Cairo / Giza', 75.00),
('Delta / Canal', 90.00),
('Upper Egypt / Remote', 110.00)
on conflict (zone_name) do update set
    estimated_cost = excluded.estimated_cost;

-- 4. Orders Table Snapshot Columns
alter table public.orders add column if not exists delivery_mode text default 'pickup';
alter table public.orders add column if not exists pricing_snapshot jsonb;
alter table public.orders add column if not exists referral_code text;
alter table public.orders add column if not exists referral_commission_amount numeric(10,2) default 0.00;
alter table public.orders add column if not exists financial_breakdown jsonb;
alter table public.orders add column if not exists deposit_required numeric(10,2);
alter table public.orders add column if not exists deposit_paid numeric(10,2) default 0.00;
alter table public.orders add column if not exists remaining_balance numeric(10,2);

-- 5. Row Level Security
alter table public.pricing_settings enable row level security;
alter table public.material_rates enable row level security;
alter table public.shipping_zones enable row level security;

-- Public read policies
do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'Public read pricing_settings') then
        create policy "Public read pricing_settings" on public.pricing_settings for select using (true);
    end if;
    if not exists (select 1 from pg_policies where policyname = 'Public update pricing_settings') then
        create policy "Public update pricing_settings" on public.pricing_settings for update using (true);
    end if;
    if not exists (select 1 from pg_policies where policyname = 'Public read material_rates') then
        create policy "Public read material_rates" on public.material_rates for select using (true);
    end if;
    if not exists (select 1 from pg_policies where policyname = 'Public read shipping_zones') then
        create policy "Public read shipping_zones" on public.shipping_zones for select using (true);
    end if;
end $$;
