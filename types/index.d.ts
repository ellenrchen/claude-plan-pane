export type PlanDoc = { path: string; text: string; updatedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'plan-pane': { plan: PlanDoc | null }
  }
}
