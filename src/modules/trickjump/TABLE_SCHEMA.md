# Trickjump Module Table Organization

## Table: `trickjump_tiers`

**Columns**: `id`, `server`, `ordinal`, `name`, `display_name`

`id`: serial UNIQUE (Int),
`server`: BigInt UNIQUE NOT NULL REFERENCES trickjump_guilds (server) ON DELETE CASCADE,
`ordinal`: smallint NOT NULL,
`name`: varchar(100),
`display_name`: varchar(100) NOT NULL,
UNIQUE(name, server),
UNIQUE(server, ordinal)

## Table: `trickjump_jumps`

**Columns**: `id`, `name`, `description`, `kingdom`, `location`, `tier_id`, `jump_type`, `link`, `added_by`, `updated_at`, `hash`

`id`: serial UNIQUE (Int),
`name`: varchar(100) NOT NULL,
`display_name`: varchar(100) NOT NULL,
`description`: varchar(1500) NOT NULL,
`kingdom`: smallint [Cap, Cascade, Sand, Lake, Wooded, Cloud, Lost, Night Metro, Metro, Snow, Seaside, Luncheon, Ruined, Bowser's, Moon, Dark Side, Darker Side, Mushroom],
`location`: varchar(200),
`tier_id`: Int NOT NULL REFERENCES trickjump_tiers (id) ON DELETE CASCADE,
`jump_type`: varchar(100),
`link`: varchar(150),
`added_by`: BigInt NOT NULL,
`updated_at`: Int NOT NULL,
`server`: BigInt NOT NULL REFERENCES trickjump_guilds (server) ON DELETE CASCADE,
`hash`: varchar(45) NOT NULL // holds SHA-256 base64 representation
UNIQUE (name, server)

## Table: `trickjump_entries`

**Columns**: `jump_id`, `jump_hash`, `holder`, `link`, `added_at`, `updated_at`

`jump_id`: Int NOT NULL REFERENCES trickjump_jumps (id) ON DELETE CASCADE,
`jump_hash`: varchar(43) NOT NULL,
`holder`: BigInt NOT NULL,
`link`: varchar(150),
`added_at`: Int NOT NULL ,
`updated_at`: Int NOT NULL,
UNIQUE(jump_id, holder)

## Table: `trickjump_guilds`

**Columns**: `server`, `jumprole_channel`

`server`: BigInt UNIQUE NOT NULL
`jumprole_channel`: BigInt UNIQUE NOT NULL
