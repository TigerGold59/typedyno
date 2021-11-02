# Trickjump Module Table Organization

## Table: trickjump_tiers

**Columns**: id, server, ordinal, name, display_name

id serial UNIQUE,
server BigInt NOT NULL REFERENCES trickjump_guilds (server) ON DELETE CASCADE,
ordinal smallint NOT NULL,
name varchar(100),
display_name varchar(100) NOT NULL,
UNIQUE(name, server),
UNIQUE(server, ordinal)

## Table: trickjump_jumps

**Columns**: id, name, description, kingdom, location, tier_id, jump_type, link, added_by, updated_at, hash

id serial UNIQUE,
name varchar(100) NOT NULL,
display_name varchar(100) NOT NULL,
description varchar(1500) NOT NULL,
kingdom smallint,
location varchar(200),
tier_id Int NOT NULL REFERENCES trickjump_tiers (id) ON DELETE CASCADE,
jump_type varchar(100),
link varchar(150),
added_by BigInt NOT NULL,
updated_at Int NOT NULL,
server BigInt NOT NULL REFERENCES trickjump_guilds (server) ON DELETE CASCADE,
hash varchar(45) NOT NULL
UNIQUE (name, server)

## Table: trickjump_entries

**Columns**: jump_id, jump_hash, holder, link, added_at, updated_at

id serial UNIQUE,
jump_id Int NOT NULL REFERENCES trickjump_jumps (id) ON DELETE CASCADE,
jump_hash varchar(45) NOT NULL,
holder BigInt NOT NULL,
link varchar(150),
server BigInt NOT NULL REFERENCES trickjump_guilds (server) ON DELETE CASCADE,
added_at Int NOT NULL ,
updated_at Int NOT NULL,
UNIQUE(jump_id, holder)

## Table: trickjump_guilds

**Columns**: server, jumprole_channel

server BigInt UNIQUE NOT NULL
jumprole_channel BigInt UNIQUE NOT NULL
