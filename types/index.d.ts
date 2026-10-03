export type PlanDoc = { path: string; text: string; updatedAt: number }
export type PlanPhase = 'drafting' | 'ready' | 'approved'

declare module 'claude-code' {
  interface PluginState {
    'plan-pane': { plan: PlanDoc | null; phase: PlanPhase }
  }
}
