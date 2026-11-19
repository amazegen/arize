import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAccessVillageRoom,
  resolveAccess,
  type AccessGrantRecord,
} from '../lib/access/entitlements.ts'

const now = new Date('2026-09-04T16:00:00.000Z')

test('last-known-active renewal has bounded outage grace, not scheduled cancellation', () => {
  const grant: AccessGrantRecord = { plan: 'plus', source: 'subscription', status: 'active', starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-04T12:00:00Z', metadata: { stripe_status: 'active', cancel_at_period_end: false } }
  assert.equal(resolveAccess([grant], true, now).plan, 'plus')
  assert.equal(resolveAccess([{ ...grant, metadata: { stripe_status: 'active', cancel_at_period_end: true } }], true, now).plan, 'core')
  assert.equal(resolveAccess([grant], true, new Date('2026-09-08T12:00:00Z')).plan, 'core')
})

test('disabled billing keeps every signed-in user on full Plus access', () => {
  const access = resolveAccess([], false, now)
  assert.equal(access.plan, 'plus')
  assert.equal(access.source, 'billing_disabled')
  assert.equal(access.billingEnabled, false)
})

test('enabled billing defaults to Core without a valid grant', () => {
  const access = resolveAccess([], true, now)
  assert.equal(access.plan, 'core')
  assert.equal(access.limits.activeGoals, 3)
  assert.equal(access.limits.coachMessagesPerMonth, 20)
})

test('an active trial grants Plus and exposes only its expiration date', () => {
  const grant: AccessGrantRecord = {
    plan: 'plus',
    source: 'early_member_trial',
    status: 'active',
    starts_at: '2026-09-01T00:00:00.000Z',
    ends_at: '2026-09-15T00:00:00.000Z',
  }
  const access = resolveAccess([grant], true, now)
  assert.equal(access.plan, 'plus')
  assert.equal(access.trialEndsAt, grant.ends_at)
})

test('expired, revoked, scheduled, and future grants do not unlock Plus', () => {
  const invalidGrants: AccessGrantRecord[] = [
    { plan: 'plus', source: 'subscription', status: 'expired', starts_at: '2026-08-01T00:00:00Z', ends_at: null },
    { plan: 'plus', source: 'admin', status: 'revoked', starts_at: '2026-08-01T00:00:00Z', ends_at: null },
    { plan: 'plus', source: 'early_member_trial', status: 'scheduled', starts_at: '2026-09-05T00:00:00Z', ends_at: '2026-09-19T00:00:00Z' },
    { plan: 'plus', source: 'subscription', status: 'active', starts_at: '2026-09-05T00:00:00Z', ends_at: null },
  ]
  assert.equal(resolveAccess(invalidGrants, true, now).plan, 'core')
})

test('Core can access Wins Only while Plus can access every Village room', () => {
  const core = resolveAccess([], true, now)
  const plus = resolveAccess([], false, now)
  assert.equal(canAccessVillageRoom(core, 'Wins Only'), true)
  assert.equal(canAccessVillageRoom(core, 'Manager Mode'), false)
  assert.equal(canAccessVillageRoom(plus, 'Manager Mode'), true)
})
