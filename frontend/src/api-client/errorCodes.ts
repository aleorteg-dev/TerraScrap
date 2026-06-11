// Canonical error codes emitted by the backend (api-contract.md v0.2).
// Add here when the contract gains new codes; also add the class + map entry in errors.ts.
export type CanonicalCode =
  | 'upload_too_large'
  | 'world_not_found'
  | 'item_not_found'
  | 'validation_error'
  | 'unsupported_version'
  | 'invalid_wld'
  | 'invalid_item_id'
  | 'invalid_encoding'
  | 'coordinates_out_of_bounds'
  | 'invalid_coordinates'
  | 'catalog_unavailable'
  | 'http_error'
  | 'internal_error'
  | 'network_error'
  | 'api_version_mismatch'
  | 'unknown_error';
