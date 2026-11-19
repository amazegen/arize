export type MembershipPlan = 'core' | 'plus'

export type AccessGrantSource =
  | 'billing_disabled'
  | 'core'
  | 'early_member_trial'
  | 'checkout_trial'
  | 'subscription'
  | 'admin'

export interface AccessLimits {
  reflectHistoryDays: number | null
  activeGoals: number | null
  goalHistoryWeeks: number | null
  patternHistoryDays: number | null
  coachMessagesPerDay: number
  coachMessagesPerMonth: number
  coachConversationHistory: number | null
  villageRooms: 'wins_only' | 'all'
  villageMedia: boolean
  fridayReflectionHistoryWeeks: number | null
  reportsAndExports: boolean
}

export interface AccessSnapshot {
  continuity?: boolean
  continuityEndsAt?: string
  temporarilyUnavailable?: boolean
  plan: MembershipPlan
  source: AccessGrantSource
  billingEnabled: boolean
  trialEndsAt: string | null
  limits: AccessLimits
}

export interface AccessGrantRecord {
  metadata?: { stripe_status?: string; cancel_at_period_end?: boolean; livemode?: boolean; [key: string]: unknown }
  plan: MembershipPlan
  source: Exclude<AccessGrantSource, 'billing_disabled' | 'core'>
  status: 'scheduled' | 'active' | 'expired' | 'revoked'
  starts_at: string
  ends_at: string | null
}

export const MEMBERSHIP_PRICING = {
  monthlyUsd: 1.99,
  annualUsd: 19.99,
  newMemberTrialDays: 7,
  earlyMemberTrialDays: 14,
} as const

export const CORE_LIMITS: AccessLimits = {
  reflectHistoryDays: 7,
  activeGoals: 3,
  goalHistoryWeeks: 1,
  patternHistoryDays: 7,
  coachMessagesPerDay: 5,
  coachMessagesPerMonth: 20,
  coachConversationHistory: 3,
  villageRooms: 'wins_only',
  villageMedia: false,
  fridayReflectionHistoryWeeks: 1,
  reportsAndExports: false,
}

export const PLUS_LIMITS: AccessLimits = {
  reflectHistoryDays: null,
  activeGoals: null,
  goalHistoryWeeks: null,
  patternHistoryDays: null,
  coachMessagesPerDay: 30,
  coachMessagesPerMonth: 300,
  coachConversationHistory: null,
  villageRooms: 'all',
  villageMedia: true,
  fridayReflectionHistoryWeeks: null,
  reportsAndExports: true,
}

function plusSnapshot(
  billingEnabled: boolean,
  source: AccessGrantSource,
  trialEndsAt: string | null,
): AccessSnapshot {
  return {
    plan: 'plus',
    source,
    billingEnabled,
    trialEndsAt,
    limits: PLUS_LIMITS,
  }
}

export function resolveAccess(
  grants: AccessGrantRecord[],
  billingEnabled: boolean,
  now = new Date(),
): AccessSnapshot {
  // During rollout, everyone keeps the complete product. This prevents a
  // database migration or unfinished checkout integration from locking users
  // out when the membership flag is off.
  if (!billingEnabled) return plusSnapshot(false, 'billing_disabled', null)

  const nowMs = now.getTime()
  const activeGrant = grants.find(grant => {
    const startMs = Date.parse(grant.starts_at)
    let endMs = grant.ends_at ? Date.parse(grant.ends_at) : null
    if (endMs !== null && grant.source === 'subscription' && grant.metadata?.stripe_status === 'active'
      && grant.metadata.cancel_at_period_end === false) endMs += 72 * 60 * 60_000
    return grant.plan === 'plus'
      && grant.status === 'active'
      && Number.isFinite(startMs)
      && startMs <= nowMs
      && (endMs === null || endMs > nowMs)
  })

  if (activeGrant) {
    const trialEndsAt = activeGrant.source === 'early_member_trial'
      || activeGrant.source === 'checkout_trial'
      ? activeGrant.ends_at
      : null
    return plusSnapshot(true, activeGrant.source, trialEndsAt)
  }

  return {
    plan: 'core',
    source: 'core',
    billingEnabled: true,
    trialEndsAt: null,
    limits: CORE_LIMITS,
  }
}

export function hasCoreRestrictions(access: AccessSnapshot) {
  return access.billingEnabled && access.plan === 'core'
}

export function canAccessVillageRoom(access: AccessSnapshot, roomName: string) {
  return access.limits.villageRooms === 'all' || roomName.trim().toLowerCase() === 'wins only'
}
