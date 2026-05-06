# CS:GO Game Events — Complete Reference

> Source: https://wiki.alliedmods.net/Counter-Strike:_Global_Offensive_Events
> Fetched: 2026-04-07
> Total events: 169

## Event Type System

Game events use their own type enum (from GameEventList descriptor):
- 1 = string
- 2 = float
- 3 = long (int32)
- 4 = short (int16)
- 5 = byte (uint8)
- 6 = bool
- 7 = local (client-only, not in demos)

## Categories and Event Counts

| Category | Count | Key Events |
|----------|-------|------------|
| Player Actions | 17 | player_death, player_hurt, player_blind, player_spawned |
| Bomb | 10 | bomb_planted, bomb_defused, bomb_exploded, bomb_dropped |
| Defuser | 2 | defuser_dropped, defuser_pickup |
| Weapon | 9 | weapon_fire, weapon_reload, weapon_zoom, silencer_* |
| Grenade | 14 | hegrenade_detonate, flashbang_detonate, smokegrenade_*, molotov_*, decoy_*, inferno_* |
| Item | 8 | item_purchase, item_pickup, item_equip, item_remove, ammo_* |
| Zone | 6 | enter/exit_buyzone, enter/exit_bombzone, enter/exit_rescue_zone |
| Buy Menu | 3 | buymenu_open, buymenu_close, buytime_ended |
| Round | 8 | round_start, round_end, round_freeze_end, round_mvp, round_prestart, round_poststart |
| Hostage | 7 | hostage_follows, hostage_hurt, hostage_killed, hostage_rescued |
| VIP | 2 | vip_escaped, vip_killed |
| Spectator | 3 | spec_target_updated, spec_mode_updated, cs_prev_next_spectator |
| Bullet/Impact | 1 | bullet_impact |
| Door | 1 | door_moving |
| Game State | 8 | announce_phase_end, cs_intermission, cs_win_panel_*, match_end_conditions |
| Achievement | 3 | achievement_earned, achievement_info_loaded |
| Item Collection | 3 | item_found, items_gifted, repost_xbox_achievements |
| Navigation | 2 | nav_blocked, nav_generate |
| Team | 2 | switch_team, teamplay_round_start |
| Gun Game | 8 | gg_player_levelup, gg_killed_enemy, gg_final_weapon_achieved |
| Training | 6 | tr_player_flashbanged, tr_mark_complete, tr_show_* |
| Assassination | 1 | assassination_target_killed |
| Misc Control | 6 | bot_takeover, jointeam_failed, teamchange_pending, nextlevel_changed |
| Seasonal/Tournament | 4 | seasoncoin_levelup, tournament_reward, start_halftime |
| Danger Zone | 17 | parachute_*, drone_*, loot_crate_*, survival_* |
| Voting | 2 | start_vote, enable_restart_voting |
| UI | 6 | sfuievent, cs_handle_ime_event, trial_time_expired, write_profile_data |
| Other | 4 | other_death, player_radio, show_freezepanel, hide_freezepanel |

## Full Event Details

### Player Actions (17)

- **player_death**: userid(short), attacker(short), assister(short), assistedflash(bool), weapon(string), weapon_itemid(string), weapon_fauxitemid(string), weapon_originalowner_xuid(string), headshot(bool), dominated(short), revenge(short), wipe(short), penetrated(short), noreplay(bool), noscope(bool), thrusmoke(bool), attackerblind(bool), distance(float)
- **player_hurt**: userid(short), attacker(short), health(byte), armor(byte), weapon(string), dmg_health(short), dmg_armor(byte), hitgroup(byte)
- **player_spawned**: userid(short), inrestart(bool)
- **player_blind**: userid(short), attacker(short), entityid(short), blind_duration(float)
- **player_falldamage**: userid(short), damage(float)
- **player_footstep**: userid(short)
- **player_jump**: userid(short)
- **player_decal**: userid(short)
- **player_stats_updated**: forceupload(bool)
- **player_avenged_teammate**: avenger_id(short), avenged_player_id(short)
- **player_reset_vote**: userid(short), vote(short)
- **player_ping**: userid(short), entityid(short), x(float), y(float), z(float), urgent(bool)
- **player_ping_stop**: entityid(short)
- **player_given_c4**: userid(short)
- **player_become_ghost**: userid(short)
- **player_radio**: userid(short), slot(short)
- **other_death**: otherid(short), othertype(string), attacker(short), weapon(string), weapon_itemid(string), weapon_fauxitemid(string), weapon_originalowner_xuid(string), headshot(bool), penetrated(short), noscope(bool), thrusmoke(bool)

### Bomb (10)

- **bomb_beginplant**: userid(short), site(short)
- **bomb_abortplant**: userid(short), site(short)
- **bomb_planted**: userid(short), site(short)
- **bomb_defused**: userid(short), site(short)
- **bomb_exploded**: userid(short), site(short)
- **bomb_dropped**: userid(short), entindex(long)
- **bomb_pickup**: userid(short)
- **bomb_begindefuse**: userid(short), haskit(bool)
- **bomb_abortdefuse**: userid(short)
- **bomb_beep**: entindex(long)

### Weapon (9)

- **weapon_fire**: userid(short), weapon(string), silenced(bool)
- **weapon_fire_on_empty**: userid(short), weapon(string)
- **weapon_reload**: userid(short)
- **weapon_zoom**: userid(short)
- **weapon_zoom_rifle**: userid(short)
- **weapon_outofammo**: userid(short)
- **silencer_detach**: userid(short)
- **silencer_on**: userid(short)
- **silencer_off**: userid(short)
- **inspect_weapon**: userid(short)

### Grenade (14)

- **grenade_thrown**: userid(short), weapon(string)
- **grenade_bounce**: userid(short)
- **hegrenade_detonate**: userid(short), entityid(short), x(float), y(float), z(float)
- **flashbang_detonate**: userid(short), entityid(short), x(float), y(float), z(float)
- **smokegrenade_detonate**: userid(short), entityid(short), x(float), y(float), z(float)
- **smokegrenade_expired**: userid(short), entityid(short), x(float), y(float), z(float)
- **molotov_detonate**: userid(short), x(float), y(float), z(float)
- **decoy_detonate**: userid(short), entityid(short), x(float), y(float), z(float)
- **decoy_started**: userid(short), entityid(short), x(float), y(float), z(float)
- **decoy_firing**: userid(short), entityid(short), x(float), y(float), z(float)
- **tagrenade_detonate**: userid(short), entityid(short), x(float), y(float), z(float)
- **inferno_startburn**: entityid(short), x(float), y(float), z(float)
- **inferno_expire**: entityid(short), x(float), y(float), z(float)
- **inferno_extinguish**: entityid(short), x(float), y(float), z(float)

### Item (8)

- **item_purchase**: userid(short), team(short), loadout(short), weapon(string)
- **item_pickup**: userid(short), item(string), silent(bool), defindex(long)
- **item_pickup_slerp**: userid(short), index(short), behavior(short)
- **item_pickup_failed**: userid(short), item(string), reason(short), limit(short)
- **item_remove**: userid(short), item(string), defindex(long)
- **item_equip**: userid(short), item(string), defindex(long), canzoom(bool), hassilencer(bool), issilenced(bool), hastracers(bool), weptype(short), ispainted(bool)
- **ammo_pickup**: userid(short), item(string), index(long)
- **ammo_refill**: userid(short), success(bool)

### Round (8)

- **round_prestart**: (none)
- **round_poststart**: (none)
- **round_start**: timelimit(long), fraglimit(long), objective(string)
- **round_end**: winner(byte), reason(byte), message(string), legacy(byte), player_count(short), nomusic(bool)
- **round_freeze_end**: (none)
- **round_mvp**: userid(short), reason(short), value(long), musickitmvps(long), nomusic(byte)
- **announce_phase_end**: (none)
- **cs_pre_restart**: (none)

### Hostage (7)

- **hostage_follows**: userid(short), hostage(short)
- **hostage_hurt**: userid(short), hostage(short)
- **hostage_killed**: userid(short), hostage(short)
- **hostage_rescued**: userid(short), hostage(short), site(short)
- **hostage_stops_following**: userid(short), hostage(short)
- **hostage_rescued_all**: (none)
- **hostage_call_for_help**: hostage(short)

### Zone (6)

- **enter_buyzone**: userid(short), canbuy(bool)
- **exit_buyzone**: userid(short), canbuy(bool)
- **enter_bombzone**: userid(short), hasbomb(bool), isplanted(bool)
- **exit_bombzone**: userid(short), hasbomb(bool), isplanted(bool)
- **enter_rescue_zone**: userid(short)
- **exit_rescue_zone**: userid(short)

### Game State (8)

- **cs_intermission**: (none)
- **cs_game_disconnected**: (none)
- **cs_win_panel_round**: show_timer_defend(bool), show_timer_attack(bool), timer_time(short), final_event(byte), funfact_token(string), funfact_player(short), funfact_data1(long), funfact_data2(long), funfact_data3(long)
- **cs_win_panel_match**: (none)
- **cs_match_end_restart**: (none)
- **match_end_conditions**: frags(long), max_rounds(long), win_rounds(long), time(long)
- **hltv_changed_mode**: oldmode(long), newmode(long), obs_target(long)
- **start_halftime**: (none)

### Danger Zone / Survival (17)

- **parachute_pickup**: userid(short)
- **parachute_deploy**: userid(short)
- **dronegun_attack**: userid(short)
- **drone_dispatched**: userid(short), priority(short), drone_dispatched(short)
- **loot_crate_visible**: userid(short), subject(short), type(string)
- **loot_crate_opened**: userid(short), type(string)
- **open_crate_instr**: userid(short), subject(short), type(string)
- **smoke_beacon_paradrop**: userid(short), paradrop(short)
- **survival_paradrop_spawn**: entityid(short)
- **survival_paradrop_break**: entityid(short)
- **drone_cargo_detached**: userid(short), cargo(short), delivered(bool)
- **drone_above_roof**: userid(short), cargo(short)
- **choppers_incoming_warning**: global(bool)
- **firstbombs_incoming_warning**: global(bool)
- **dz_item_interaction**: userid(short), subject(short), type(string)
- **snowball_hit_player_face**: userid(short)
- **survival_teammate_respawn**: userid(short)
- **survival_no_respawns_warning**: userid(short)
- **survival_no_respawns_final**: userid(short)
- **show_survival_respawn_status**: loc_token(string), duration(long), userid(short)

### Gun Game (8)

- **gg_player_levelup**: userid(short), weaponrank(short), weaponname(string)
- **ggtr_player_levelup**: userid(short), weaponrank(short), weaponname(string)
- **ggprogressive_player_levelup**: userid(short), weaponrank(short), weaponname(string)
- **gg_killed_enemy**: victimid(short), attackerid(short), dominated(short), revenge(short), bonus(bool)
- **gg_final_weapon_achieved**: playerid(short)
- **gg_bonus_grenade_achieved**: userid(short)
- **gg_leader**: playerid(short)
- **gg_team_leader**: playerid(short)
- **gg_player_impending_upgrade**: userid(short)
- **gg_reset_round_start_sounds**: userid(short)

### Misc (remaining)

- **VIP**: vip_escaped, vip_killed
- **Spectator**: spec_target_updated, spec_mode_updated, cs_prev_next_spectator
- **Bullet**: bullet_impact (userid, x, y, z)
- **Door**: door_moving (entindex, userid)
- **Achievement**: achievement_info_loaded, achievement_earned, achievement_earned_local
- **Nav**: nav_blocked, nav_generate
- **Team**: switch_team, teamplay_round_start
- **Training**: tr_player_flashbanged, tr_mark_complete, tr_mark_best_time, tr_exit_hint_trigger, tr_show_finish_msgbox, tr_show_exit_msgbox
- **Control**: bot_takeover, reset_player_controls, jointeam_failed, teamchange_pending, material_default_complete, client_disconnect, nextlevel_changed
- **Voting**: start_vote, enable_restart_voting
- **UI**: sfuievent, cs_handle_ime_event, trial_time_expired, write_profile_data, guardian_wave_restart, mb_input_lock_*
- **Buy**: buymenu_open, buymenu_close, buytime_ended
- **Freezepanel**: show_freezepanel, hide_freezepanel, freezecam_started
- **Assassination**: assassination_target_killed
- **Seasonal**: seasoncoin_levelup, tournament_reward, update_matchmaking_stats
- **Item Collection**: item_found, items_gifted
