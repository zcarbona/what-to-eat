// Types mirror the Pydantic schemas in app/schemas/* and the dict responses
// returned by app/api/routes/{auth,groups}.py.

export type GroupType = 'family' | 'friends' | 'gathering'
export type MemberRole = 'admin' | 'member'

/** app/schemas/auth.py — Token */
export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

/** app/schemas/auth.py — UserResponse */
export interface User {
  id: number
  username: string
  email: string
  is_active: boolean
  created_at: string
}

/** app/schemas/auth.py — UserCreate */
export interface RegisterPayload {
  username: string
  email: string
  password: string
}

/** app/schemas/group.py — GroupResponse */
export interface Group {
  id: number
  name: string
  group_type: GroupType
  created_by: number
  created_at: string
}

/** app/schemas/group.py — Creategroup */
export interface GroupCreatePayload {
  name: string
  group_type: GroupType
}

/** app/schemas/group.py — GroupUpdate */
export interface GroupUpdatePayload {
  name?: string
  group_type?: GroupType
}

/** app/schemas/auth.py — GroupMemberResponse (GET /groups/{id}/members) */
export interface GroupMember {
  user_id: number
  username: string
  role: MemberRole
  is_active: boolean
}

/** app/schemas/invitation.py — InvitationResponse. `code` is returned only once. */
export interface Invitation {
  id: number
  group_id: number
  created_by: number
  code: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
  created_at: string
}

/** POST /groups/{id}/join */
export interface JoinResult {
  message: string
  group_id: number
  membership_status: string
}

/** PATCH /groups/{id}/membership/{user_id}/role */
export interface DetailMessage {
  detail: string
}
