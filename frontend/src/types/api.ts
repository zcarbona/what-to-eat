// Types mirror the Pydantic schemas in app/schemas/* and the responses
// returned by app/api/routes/{auth,groups,family_meals,food_decisions,gatherings,notifications}.py.

export type GroupType = 'family' | 'friends' | 'gathering'
export type MemberRole = 'admin' | 'member'
export type MealType = 'breakfast' | 'lunch' | 'dinner'
export type ResponsibilityStatus = 'pending' | 'completed' | 'reported' | 'confirmed' | 'rejected'

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

/** app/schemas/family_meal.py — MealResponse */
export interface FamilyMeal {
  id: number
  group_id: number
  name: string
  description: string | null
  ingredients: string[]
  instructions: string
  is_active: boolean
  created_at: string
}

export interface FamilyMealCreatePayload {
  name: string
  description?: string | null
  ingredients: string[]
  instructions: string
}

export interface FamilyMealUpdatePayload {
  name?: string
  description?: string | null
  ingredients?: string[]
  instructions?: string
  is_active?: boolean
}

/** app/schemas/family_meal.py — ShoppingResponsibilityResponse */
export interface ShoppingResponsibility {
  id: number
  group_id: number
  assigned_user_id: number
  assigned_username: string
  meal_id: number
  meal_name: string
  ingredients: string[]
  status: ResponsibilityStatus
  due_at: string | null
  created_at: string
}

export interface ShoppingResponsibilityCreatePayload {
  assigned_user_id: number
  meal_id: number
  due_at?: string | null
}

/** app/schemas/food_decision.py — FoodSubmissionResponse */
export interface FoodSubmission {
  id: number
  round_id: number
  user_id: number
  username: string
  food_name: string
  note: string | null
  created_at: string
}

/** app/schemas/food_decision.py — DecisionRoundResponse */
export interface DecisionRound {
  id: number
  group_id: number
  title: string | null
  created_by: number | null
  scheduled_date: string | null
  assigned_user_id: number | null
  assigned_username: string | null
  selected_meal_id: number | null
  selected_meal_name: string | null
  deadline_at: string | null
  closes_at: string | null
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED' | string
  decided_at: string | null
  created_at: string
  submissions: FoodSubmission[]
  winning_submission_id: number | null
  winning_food_name: string | null
  winning_username: string | null
}

export interface DecisionRoundCreatePayload {
  title: string
  scheduled_date?: string | null
  assigned_user_id?: number | null
  deadline_at?: string | null
  closes_at?: string | null
}

/** app/schemas/gathering.py — GatheringResponse */
export interface Gathering {
  id: number
  name: string
  description: string | null
  gathering_time: string
  meal_type: MealType
  group_id: number
  created_by: number
  created_at: string
}

export interface GatheringCreatePayload {
  name: string
  description?: string | null
  gathering_time: string
  meal_type: MealType
  group_id: number
}

export interface GatheringUpdatePayload {
  name?: string
  description?: string | null
  gathering_time?: string
  meal_type?: MealType
}

/** app/schemas/gathering.py — GatheringPreferenceResponse */
export interface GatheringPreference {
  id: number
  event_id: number
  user_id: number
  username?: string | null
  allergies: string[]
  dietary_restrictions: string[]
  dislikes: string[]
  notes?: string | null
  created_at?: string | null
}

export interface GatheringPreferencePayload {
  allergies: string[]
  dietary_restrictions: string[]
  dislikes: string[]
  notes?: string | null
}

/** app/schemas/gathering.py — GatheringMenuItemResponse */
export interface GatheringMenuItem {
  id: number
  event_id: number
  name: string
  category: string
  assigned_user_id: number | null
  assigned_username?: string | null
  created_by: number
  created_at: string
}

export interface GatheringMenuItemCreatePayload {
  name: string
  category?: string
  assigned_user_id?: number | null
}

/** app/api/routes/notifications.py — NotificationResponse */
export interface AppNotification {
  id: number
  user_id: number
  title: string
  message: string
  notification_type: string
  is_read: boolean
  created_at: string
}
