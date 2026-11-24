// TODO(backend): POST /approval-requests/{id}/actions has approve, reject, return and cancel only. "Clarify" needs an
// action that records the question and keeps the request at its level (e.g. action 'clarify'); 'return' ends it.
/** Shown on the Clarify control: the server has no action for it yet. */
export const CLARIFY_UNAVAILABLE = 'Not available yet: the server cannot record a clarification request. Reject with a reason, or approve with a comment.'

// TODO(backend): publishing an approved job opening to a location has no endpoint (needs e.g.
// POST /approval-requests/{id}/publish, or PATCH of payloadJson.publishedToSite).
/** Shown on the Publish to location control: the server has no endpoint for it yet. */
export const PUBLISH_UNAVAILABLE = 'Not available yet: the server cannot record that a job opening was published to a location.'
