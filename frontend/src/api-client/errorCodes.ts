// Canonical error codes emitted by the backend (api-contract.md v0.1.0).
// Add here when the contract gains new codes; also add the class + map entry in errors.ts.
export type CanonicalCode =
  | 'upload_too_large'
  | 'world_not_found'
  | 'item_not_found'
  | 'validation_error'
  | 'unsupported_version'
  | 'invalid_wld'
  | 'invalid_item_id'
  | 'http_error'
  | 'internal_error'
  | 'network_error'
  | 'unknown_error';
