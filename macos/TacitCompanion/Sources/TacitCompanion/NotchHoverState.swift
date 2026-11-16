/// Hover retraction hides presentation only. CommunicationSession owns the workspace and all drafts.
struct NotchHoverState {
    private(set) var restoreWorkspace = false
    private(set) var restoreReview = false
    mutating func retract(expanded: Bool, reviewing: Bool) {
        if expanded { restoreWorkspace = true; restoreReview = reviewing }
    }
    mutating func explicitCollapse() { restoreWorkspace = false; restoreReview = false }
}
