create extension if not exists "uuid-ossp";

create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  name_kana text,
  address text,
  phone text,
  job text,
  birthday date,
  created_at timestamp default now()
);

create table if not exists devices (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  model_name text,
  model_number text,
  imei text,
  color text,
  capacity text,
  carrier text,
  sim_lock text,
  battery text,
  condition text,
  max_price int,
  estimated_price int,
  notes text,
  created_at timestamp default now()
);

create table if not exists deliveries (
  id uuid primary key default uuid_generate_v4(),
  device_id uuid references devices(id) on delete cascade,
  delivery_date date,
  delivery_pdf text
);
