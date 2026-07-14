export function homeProjectSwitchState<T>(input: {
  projectName?: string
  fallbackTitle: string
  loading: boolean
  content: T[]
}) {
  return {
    title: input.projectName ?? input.fallbackTitle,
    selected: input.projectName !== undefined,
    loading: input.loading,
    content: input.loading ? [] : input.content,
  }
}
