import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('saved chat grants replace hosted defaults rather than only adding permissions', () => {
  for (const file of ['supabase/schema.sql', 'supabase/schema-updates.sql']) {
    const sql = readFileSync(file, 'utf8')
    assert.match(sql, /revoke all on coach_conversations, coach_messages from public, anon, authenticated;/)
    assert.match(sql, /grant select, insert, update, delete on coach_conversations to authenticated;/)
    assert.match(sql, /grant select, insert on coach_messages to authenticated;/)
  }
  const migration = readFileSync('supabase/migrations/20261128131605_harden_adult_coach_history_privileges.sql', 'utf8')
  assert.match(migration, /student_schools/)
  assert.match(migration, /edition='adult'/)
  assert.match(migration, /revoke all on public.coach_conversations,public.coach_messages from public,anon,authenticated;/)
  assert.match(migration, /grant usage on sequence public.coach_messages_id_seq to authenticated;/)
  assert.doesNotMatch(migration, /disable row level security|drop table|delete from|insert into/i)
})
